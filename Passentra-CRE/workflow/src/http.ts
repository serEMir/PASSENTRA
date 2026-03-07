import {
  consensusIdenticalAggregation,
  cre,
  text,
  type Runtime,
} from "@chainlink/cre-sdk";
import type { Config } from "./schema";
import type { PostJsonInput, PostJsonOutput, SecretBackedServiceConfig } from "./types";

/**
 * Builds Authorization headers for confidential templated HTTP requests.
 *
 * @param service Secret-backed service configuration.
 * @returns Plain headers and VaultDON secret descriptors.
 */
export const buildAuthHeaders = (
  service: SecretBackedServiceConfig,
): Pick<PostJsonInput, "headers" | "vaultDonSecrets"> => ({
  headers: {
    authorization: `Bearer {{.${service.apiKeySecretId}}}`,
  },
  vaultDonSecrets: [
    {
      key: service.apiKeySecretId,
      namespace: service.vaultNamespace,
      ...(service.vaultOwner ? { owner: service.vaultOwner } : {}),
    },
  ],
});

const toConfidentialHeaders = (
  headers: Record<string, string>,
): Record<string, { values: string[] }> => {
  const multiHeaders: Record<string, { values: string[] }> = {};
  for (const [header, value] of Object.entries(headers)) {
    multiHeaders[header] = { values: [value] };
  }
  return multiHeaders;
};

/**
 * Sends a consensus-verified JSON POST using ConfidentialHTTPClient.
 *
 * @param runtime CRE runtime instance.
 * @param input HTTP request details and body.
 * @returns HTTP status code and UTF-8 response body text.
 */
export const postJson = (
  runtime: Runtime<Config>,
  input: PostJsonInput,
): PostJsonOutput => {
  const confidentialHttpClient = new cre.capabilities.ConfidentialHTTPClient();
  return confidentialHttpClient
    .sendRequest<[PostJsonInput], PostJsonOutput>(
      runtime,
      (sendRequester, request) => {
        const response = sendRequester
          .sendRequest({
            vaultDonSecrets: request.vaultDonSecrets ?? [],
            request: {
              url: request.url,
              method: "POST",
              multiHeaders: toConfidentialHeaders({
                "content-type": "application/json",
                ...request.headers,
              }),
              bodyString: JSON.stringify(request.body),
            },
          })
          .result();

        return {
          statusCode: response.statusCode,
          bodyText: text(response),
        };
      },
      consensusIdenticalAggregation<PostJsonOutput>(),
    )(input)
    .result();
};
