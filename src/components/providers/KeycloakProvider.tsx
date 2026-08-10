"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import keycloak from "@/lib/keycloak";
import { Button } from "@/components/ui/button";

interface AuthState {
  initialized: boolean;
  authenticated: boolean;
  isAdmin: boolean;
  userName: string | null;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState>({
  initialized: false,
  authenticated: false,
  isAdmin: false,
  userName: null,
  login: () => {},
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

function deriveUserName(): string | null {
  const parsed = keycloak.tokenParsed as
    | { given_name?: string; family_name?: string; name?: string; preferred_username?: string; email?: string }
    | undefined;
  if (!parsed) return null;
  const fullName = [parsed.given_name, parsed.family_name].filter(Boolean).join(" ");
  return fullName || parsed.name || parsed.preferred_username || parsed.email || null;
}

function deriveIsAdmin(): boolean {
  const parsed = keycloak.tokenParsed as { realm_access?: { roles?: string[] } } | undefined;
  return (parsed?.realm_access?.roles ?? []).includes("lineup_admin");
}

export function KeycloakProvider({ children }: { children: React.ReactNode }) {
  const [initialized, setInitialized] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const initStarted = useRef(false);

  useEffect(() => {
    // Guard against React StrictMode's double-invoke in dev — keycloak-js throws if init() runs twice.
    if (initStarted.current) return;
    initStarted.current = true;

    keycloak.onTokenExpired = () => {
      keycloak.updateToken(30).catch(() => keycloak.login());
    };

    keycloak
      .init({
        onLoad: "check-sso",
        pkceMethod: "S256",
        checkLoginIframe: false,
        // Without this, the initial silent SSO check falls back to a full top-level
        // redirect round-trip — normally invisible, but it can leave the OIDC response
        // fragment (#state=...&code=...) sitting in the address bar. Pointing it at a
        // dedicated static page runs the whole check inside a hidden iframe instead, so
        // the visible URL is never touched at all.
        silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`,
      })
      .then((auth) => {
        setAuthenticated(auth);
        setInitialized(true);
      })
      .catch(() => setInitialized(true));
  }, []);

  const value: AuthState = {
    initialized,
    authenticated,
    isAdmin: authenticated && deriveIsAdmin(),
    userName: authenticated ? deriveUserName() : null,
    login: () => keycloak.login({ redirectUri: window.location.href }),
    logout: () => keycloak.logout({ redirectUri: `${window.location.origin}/lineup` }),
  };

  if (!initialized) return null;

  if (!authenticated) {
    return (
      <AuthContext.Provider value={value}>
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <h1 className="text-2xl font-bold">ליינאפ אירועים</h1>
            <p className="text-muted-foreground">יש להתחבר כדי להמשיך</p>
            <Button onClick={value.login}>התחברות</Button>
          </div>
        </div>
      </AuthContext.Provider>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
