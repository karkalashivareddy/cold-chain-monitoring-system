import request from "supertest";
import type { Express } from "express";
import { createApp } from "../src/app";

export const app: Express = createApp();

export const DEMO_PASSWORD = "Frostguard#2026";

export type LoginResult = {
  token: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    organization: { id: string; name: string; slug: string; timezone: string };
    permissions: string[];
  };
  refreshToken: string | null;
};

export function cookieValue(res: request.Response, name: string): string | null {
  const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
  const match = (raw ?? []).find((c) => c.startsWith(`${name}=`));
  if (!match) return null;
  const value = match.split(";")[0]!.slice(name.length + 1);
  return decodeURIComponent(value);
}

export async function login(
  email: string,
  options: { password?: string; organizationSlug?: string } = {}
): Promise<LoginResult> {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({
      email,
      password: options.password ?? DEMO_PASSWORD,
      ...(options.organizationSlug ? { organizationSlug: options.organizationSlug } : {}),
    });
  if (res.status !== 200) {
    throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return {
    token: res.body.data.accessToken as string,
    user: res.body.data.user as LoginResult["user"],
    refreshToken: cookieValue(res, "fg_refresh"),
  };
}

export function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

export const NORTHLINE = {
  owner: "owner@northline.demo",
  manager: "manager@northline.demo",
  operator: "operator@northline.demo",
  auditor: "auditor@northline.demo",
  viewer: "viewer@northline.demo",
};

export const MERIDIAN = {
  owner: "owner@meridian.demo",
};
