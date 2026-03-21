import { createSign } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type GoogleAuthorizedUserCredentials = {
  type: "authorized_user";
  client_id: string;
  client_secret: string;
  refresh_token: string;
};

type GoogleServiceAccountCredentials = {
  type: "service_account";
  client_email: string;
  private_key: string;
  token_uri?: string;
};

type GoogleAdcCredentials = GoogleAuthorizedUserCredentials | GoogleServiceAccountCredentials;

type FetchLike = typeof fetch;

type CachedAdcToken = {
  accessToken: string;
  expiresAt: number;
};

type ResolveTokenOptions = {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
};

const GOOGLE_ADC_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const REFRESH_BEFORE_EXPIRY_MS = 5 * 60 * 1000;
const adcTokenCache = new Map<string, CachedAdcToken>();

export const resolveGoogleAdcPath = (env: NodeJS.ProcessEnv = process.env): string =>
  env.GOOGLE_APPLICATION_CREDENTIALS?.trim() || join(homedir(), ".config", "gcloud", "application_default_credentials.json");

export const hasGoogleAdcCredentials = (env: NodeJS.ProcessEnv = process.env): boolean =>
  existsSync(resolveGoogleAdcPath(env));

const isValidCachedToken = (cached: CachedAdcToken | undefined): cached is CachedAdcToken =>
  cached !== undefined && Date.now() < cached.expiresAt - REFRESH_BEFORE_EXPIRY_MS;

const readGoogleAdcCredentials = (env: NodeJS.ProcessEnv = process.env): GoogleAdcCredentials => {
  const adcPath = resolveGoogleAdcPath(env);
  if (!existsSync(adcPath)) {
    throw new Error(`ADC credentials not found at ${adcPath}`);
  }

  return JSON.parse(readFileSync(adcPath, "utf8")) as GoogleAdcCredentials;
};

const encodeJwtSegment = (value: string): string => Buffer.from(value, "utf8").toString("base64url");

const signServiceAccountAssertion = (
  credentials: GoogleServiceAccountCredentials,
  nowSeconds: number
): string => {
  const header = encodeJwtSegment(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = encodeJwtSegment(
    JSON.stringify({
      iss: credentials.client_email,
      scope: GOOGLE_ADC_SCOPE,
      aud: credentials.token_uri || GOOGLE_OAUTH_TOKEN_URL,
      exp: nowSeconds + 3600,
      iat: nowSeconds
    })
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  signer.end();
  const signature = signer.sign(credentials.private_key).toString("base64url");
  return `${header}.${payload}.${signature}`;
};

const parseTokenResponse = async (response: Response): Promise<CachedAdcToken> => {
  const payload = (await response.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(
      `ADC token refresh failed with ${response.status}${payload.error ? ` (${payload.error})` : ""}`
    );
  }

  return {
    accessToken: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000
  };
};

const refreshAuthorizedUserToken = async (
  credentials: GoogleAuthorizedUserCredentials,
  fetchImpl: FetchLike
): Promise<CachedAdcToken> => {
  const response = await fetchImpl(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
      refresh_token: credentials.refresh_token
    }).toString()
  });

  return parseTokenResponse(response);
};

const refreshServiceAccountToken = async (
  credentials: GoogleServiceAccountCredentials,
  fetchImpl: FetchLike
): Promise<CachedAdcToken> => {
  const assertion = signServiceAccountAssertion(credentials, Math.floor(Date.now() / 1000));
  const response = await fetchImpl(credentials.token_uri || GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    }).toString()
  });

  return parseTokenResponse(response);
};

export const resolveGoogleAdcAccessToken = async (options: ResolveTokenOptions = {}): Promise<string> => {
  const env = options.env ?? process.env;
  const adcPath = resolveGoogleAdcPath(env);
  const cached = adcTokenCache.get(adcPath);
  if (isValidCachedToken(cached)) {
    return cached.accessToken;
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const credentials = readGoogleAdcCredentials(env);
  const next =
    credentials.type === "authorized_user"
      ? await refreshAuthorizedUserToken(credentials, fetchImpl)
      : await refreshServiceAccountToken(credentials, fetchImpl);
  adcTokenCache.set(adcPath, next);
  return next.accessToken;
};

export const clearGoogleAdcTokenCache = (): void => {
  adcTokenCache.clear();
};
