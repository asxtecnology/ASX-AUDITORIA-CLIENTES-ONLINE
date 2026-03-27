export { COOKIE_NAME, SESSION_MAX_AGE_MS } from "@shared/const";

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = () => {
  if (typeof window === "undefined") {
    // SSR/test safety
    return "/";
  }

  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  // Evitar crash por config ausente.
  if (!oauthPortalUrl || !appId) {
    console.error(
      "[Auth] Missing VITE_OAUTH_PORTAL_URL and/or VITE_APP_ID. OAuth login is not configured."
    );
    // Mantém o usuário na aplicação (não quebra UI). Em produção, configure as envs.
    return window.location.href;
  }

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};
