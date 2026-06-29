import { buildApiApp } from "../app.js";
import { loadServerEnv } from "../config/loadEnv.js";

loadServerEnv();

const app = buildApiApp();

try {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email: "login-route-probe@example.invalid",
      password: "not-a-real-password"
    }
  });
  const body = response.json() as {
    error?: {
      reasonCode?: string;
      code?: string;
    };
  };
  const errorCode = body.error?.code ?? body.error?.reasonCode ?? null;

  console.log(
    JSON.stringify(
      {
        statusCode: response.statusCode,
        error: {
          code: errorCode
        },
        reachedCredentialValidation: errorCode === "INVALID_CREDENTIALS"
      },
      null,
      2
    )
  );
} finally {
  await app.close();
}
