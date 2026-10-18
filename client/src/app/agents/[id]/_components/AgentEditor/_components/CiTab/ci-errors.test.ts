import { describe, it, expect } from "vitest";
import { ApiError } from "@/lib/api";
import { ciErrorInfo } from "./ci-errors";

describe("ciErrorInfo", () => {
  it("maps typed codes, the missing permission and repo_not_connected", () => {
    // Catches: AC-16/36 reasons collapsing into a generic message.
    expect(ciErrorInfo(new ApiError("x", 422, "github_token_missing")).key).toBe("github_token_missing");
    expect(ciErrorInfo(new ApiError("x", 403, "github_permission", { permission: "workflows" }))).toEqual({ key: "github_permission", permission: "workflows" });
    expect(ciErrorInfo(new ApiError("x", 403, "github_permission")).key).toBe("github_permission_any");
    expect(ciErrorInfo(new ApiError("x", 422, "repo_not_connected")).key).toBe("repo_not_connected");
    expect(ciErrorInfo(new ApiError("x", 0, "network_error")).key).toBe("network");
    expect(ciErrorInfo(new Error("boom")).key).toBe("generic");
  });
});
