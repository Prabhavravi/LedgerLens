"use client";

// Backwards-compatible export for any existing imports. The action-aware UI is
// the only assistant surface and cannot bypass the confirmation endpoint.
export { FinancialActionAssistant as FinancialAssistant } from "./financial-action-assistant";
