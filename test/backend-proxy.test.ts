import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../next.config.mjs";

describe("FastAPI proxy", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("routes browser API requests to the configured backend", async () => {
    vi.stubEnv("BACKEND_PUBLIC_URL", "https://backend.example/api/v1");
    expect(nextConfig.rewrites).toBeTypeOf("function");
    expect(await nextConfig.rewrites!()).toEqual([
      { source: "/backend-api/:path*", destination: "https://backend.example/api/v1/:path*" },
    ]);
  });
});
