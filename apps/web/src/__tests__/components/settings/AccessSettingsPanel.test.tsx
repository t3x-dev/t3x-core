// @vitest-environment jsdom

import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/hooks/access/useAccessSettings", () => ({
  useAccessSettings: vi.fn(),
}));

import { AccessSettingsPanel } from "@/components/settings/AccessSettingsPanel";
import { useAccessSettings } from "@/hooks/access/useAccessSettings";

describe("AccessSettingsPanel", () => {
  const localConfig = {
    api_url: "http://localhost:8000/api",
    api_url_source: "default" as const,
    api_key_present: false,
    api_key_source: "none" as const,
    api_key_preview: null,
    config_path: "/Users/test/.t3x/config.json",
  };

  const openAccessCheck = {
    ok: true,
    code: "AUTH_NOT_REQUIRED" as const,
    auth_mode: "open" as const,
    message:
      "The target API is reachable and does not currently require a key.",
    api_url: "http://localhost:8000/api",
    api_key_present: false,
    api_key_source: "none" as const,
    status_code: 200,
  };

  function mockAccessSettings(
    overrides: Partial<ReturnType<typeof useAccessSettings>> = {}
  ): ReturnType<typeof useAccessSettings> {
    const value = {
      fetchLocalConfig: vi.fn().mockResolvedValue(localConfig),
      saveLocalConfig: vi.fn(),
      clearLocalApiKey: vi.fn(),
      checkLocalAccess: vi.fn().mockResolvedValue(openAccessCheck),
      listApiKeys: vi.fn().mockResolvedValue([]),
      createApiKey: vi.fn(),
      revokeApiKey: vi.fn(),
      ...overrides,
    } as ReturnType<typeof useAccessSettings>;

    vi.mocked(useAccessSettings).mockReturnValue(value);
    return value;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("loads and renders the current local shared access state", async () => {
    mockAccessSettings();

    render(<AccessSettingsPanel />);

    await waitFor(() => {
      expect(
        screen.getByDisplayValue("http://localhost:8000/api")
      ).toBeInTheDocument();
    });

    expect(screen.getByText("Local Shared Access")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This page manages the standalone API host's local API URL and key. In a one-machine setup, CLI and MCP can point at the same shared file."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("API key not configured")).toBeInTheDocument();
    expect(
      screen.getByText("/Users/test/.t3x/config.json")
    ).toBeInTheDocument();
    expect(screen.getByText("CLI fallback")).toBeInTheDocument();
    expect(screen.getByText("t3x auth use-key <key>")).toBeInTheDocument();
    expect(
      screen.getByText("t3x config set api-url <url>")
    ).toBeInTheDocument();
  });

  it("shows env override guidance when file config is not the effective source", async () => {
    mockAccessSettings({
      fetchLocalConfig: vi.fn().mockResolvedValue({
        api_url: "http://env.example/api",
        api_url_source: "env",
        api_key_present: true,
        api_key_source: "env",
        api_key_preview: "t3xk_env...",
        config_path: "/Users/test/.t3x/config.json",
      }),
    });

    render(<AccessSettingsPanel />);

    await waitFor(() => {
      expect(
        screen.getByDisplayValue("http://env.example/api")
      ).toBeInTheDocument();
    });

    expect(
      screen.getByText(
        "Environment variables currently override part of this local config. File changes stay saved, but they will not take effect until the override is removed."
      )
    ).toBeInTheDocument();
  });

  it("saves api url and api key, then clears the stored key", async () => {
    const saveLocalConfig = vi.fn().mockResolvedValue({
      api_url: "http://127.0.0.1:8100/api",
      api_url_source: "file",
      api_key_present: true,
      api_key_source: "file",
      api_key_preview: "t3xk_loc...",
      config_path: "/Users/test/.t3x/config.json",
    });
    const clearLocalApiKey = vi.fn().mockResolvedValue({
      api_url: "http://127.0.0.1:8100/api",
      api_url_source: "file",
      api_key_present: false,
      api_key_source: "none",
      api_key_preview: null,
      config_path: "/Users/test/.t3x/config.json",
    });
    const checkLocalAccess = vi.fn().mockResolvedValue(openAccessCheck);

    mockAccessSettings({
      saveLocalConfig,
      clearLocalApiKey,
      checkLocalAccess,
    });

    render(<AccessSettingsPanel />);

    await waitFor(() => {
      expect(
        screen.getByDisplayValue("http://localhost:8000/api")
      ).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("API URL"), {
      target: { value: "http://127.0.0.1:8100/api" },
    });
    fireEvent.change(screen.getByLabelText("API Key"), {
      target: { value: "t3xk_local_test_key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Access" }));

    await waitFor(() => {
      expect(saveLocalConfig).toHaveBeenCalledWith({
        api_url: "http://127.0.0.1:8100/api",
        api_key: "t3xk_local_test_key",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Clear Stored Key" }));

    await waitFor(() => {
      expect(clearLocalApiKey).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Test Access" }));

    await waitFor(() => {
      expect(checkLocalAccess).toHaveBeenCalled();
    });
  });

  it("lists T3X API keys separately from provider credentials", async () => {
    const listApiKeys = vi.fn().mockResolvedValue([
      {
        id: "ak_webui",
        name: "WebUI session",
        key_prefix: "t3xk_web",
        project_id: null,
        created_at: "2026-07-01T06:00:00.000Z",
        last_used_at: "2026-07-01T06:10:00.000Z",
        revoked_at: null,
      },
    ]);
    mockAccessSettings({ listApiKeys });

    render(<AccessSettingsPanel />);

    await waitFor(() => {
      expect(screen.getByText("T3X API keys")).toBeInTheDocument();
    });

    expect(screen.getByText("WebUI session")).toBeInTheDocument();
    expect(screen.getByText("t3xk_web")).toBeInTheDocument();
    expect(screen.getByText("User-level key")).toBeInTheDocument();
    expect(
      screen.getByText("Provider keys stay in Settings / Providers.")
    ).toBeInTheDocument();
  });

  it("creates a T3X API key and shows the raw value only in the creation result", async () => {
    const createApiKey = vi.fn().mockResolvedValue({
      id: "ak_created",
      name: "CLI key",
      key: "t3xk_created_secret",
      key_prefix: "t3xk_cre",
      project_id: null,
      created_at: "2026-07-01T06:15:00.000Z",
    });
    const listApiKeys = vi.fn().mockResolvedValue([]);
    mockAccessSettings({ createApiKey, listApiKeys });

    render(<AccessSettingsPanel />);

    await waitFor(() => {
      expect(screen.getByLabelText("New API key name")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("New API key name"), {
      target: { value: "CLI key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create API key" }));

    await waitFor(() => {
      expect(createApiKey).toHaveBeenCalledWith({ name: "CLI key" });
    });
    expect(screen.getByText("t3xk_created_secret")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss created key" })
    );

    expect(screen.queryByText("t3xk_created_secret")).not.toBeInTheDocument();
  });

  it("revokes a T3X API key and refreshes the list", async () => {
    const listApiKeys = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: "ak_old",
          name: "Old automation key",
          key_prefix: "t3xk_old",
          project_id: null,
          created_at: "2026-07-01T05:00:00.000Z",
          last_used_at: null,
          revoked_at: null,
        },
      ])
      .mockResolvedValueOnce([]);
    const revokeApiKey = vi.fn().mockResolvedValue({
      id: "ak_old",
      name: "Old automation key",
      key_prefix: "t3xk_old",
      project_id: null,
      created_at: "2026-07-01T05:00:00.000Z",
      last_used_at: null,
      revoked_at: "2026-07-01T06:20:00.000Z",
    });
    mockAccessSettings({ listApiKeys, revokeApiKey });

    render(<AccessSettingsPanel />);

    await waitFor(() => {
      expect(screen.getByText("Old automation key")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Revoke Old automation key" })
    );

    await waitFor(() => {
      expect(revokeApiKey).toHaveBeenCalledWith("ak_old");
    });
    await waitFor(() => {
      expect(screen.queryByText("Old automation key")).not.toBeInTheDocument();
    });
    expect(listApiKeys).toHaveBeenCalledTimes(2);
  });

  it("does not revoke a T3X API key when confirmation is cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const listApiKeys = vi.fn().mockResolvedValue([
      {
        id: "ak_keep",
        name: "Keep this key",
        key_prefix: "t3xk_kep",
        project_id: null,
        created_at: "2026-07-01T05:00:00.000Z",
        last_used_at: null,
        revoked_at: null,
      },
    ]);
    const revokeApiKey = vi.fn();
    mockAccessSettings({ listApiKeys, revokeApiKey });

    render(<AccessSettingsPanel />);

    await waitFor(() => {
      expect(screen.getByText("Keep this key")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Revoke Keep this key" })
    );

    expect(revokeApiKey).not.toHaveBeenCalled();
    expect(screen.getByText("Keep this key")).toBeInTheDocument();
  });
});
