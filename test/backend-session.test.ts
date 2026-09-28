import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getBackendAuthenticatedUser } from "@/lib/backend/session";

const { cookieString } = vi.hoisted(() => ({ cookieString: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: () => ({ toString: cookieString }) }));

describe("FastAPI session integration", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv("BACKEND_INTERNAL_URL", "https://backend.example/api/v1");
    vi.stubGlobal("fetch", fetchMock);
    cookieString.mockReturnValue("ledgerlens_session=opaque-token");
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("forwards cookies to FastAPI without caching identity", async () => {
    const user = { id: "user-a", email: "a@example.com" };
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, data: { user } })));

    expect(await getBackendAuthenticatedUser()).toEqual(user);
    expect(fetchMock).toHaveBeenCalledWith("https://backend.example/api/v1/auth/me", {
      headers: { cookie: "ledgerlens_session=opaque-token" },
      cache: "no-store",
    });
  });

  it("treats a rejected session as unauthenticated", async () => {
    fetchMock.mockResolvedValue(new Response("Unauthorized", { status: 401 }));
    expect(await getBackendAuthenticatedUser()).toBeNull();
  });

  it("fails closed when the backend is unavailable", async () => {
    fetchMock.mockRejectedValue(new Error("Connection refused"));
    expect(await getBackendAuthenticatedUser()).toBeNull();
  });

  it("handles a visitor without cookies", async () => {
    cookieString.mockReturnValue("");
    fetchMock.mockResolvedValue(new Response("Unauthorized", { status: 401 }));
    expect(await getBackendAuthenticatedUser()).toBeNull();
    expect(fetchMock.mock.calls[0][1].headers).toEqual({});
  });

  it("does not invent an identity from an empty response", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, data: {} })));
    expect(await getBackendAuthenticatedUser()).toBeNull();
  });
});
