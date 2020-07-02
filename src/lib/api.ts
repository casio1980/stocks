import OpenAPI from "@tinkoff/invest-openapi-js-sdk";

export default function getAPI() {
  const isProduction = process.env.PRODUCTION === "true";

  let apiURL: string;
  let secretToken: string;
  if (isProduction) {
    // PRODUCTION mode
    apiURL = "https://api-invest.tinkoff.ru/openapi";
    secretToken = process.env.TOKEN;
  } else {
    // SANDBOX mode
    apiURL = "https://api-invest.tinkoff.ru/openapi/sandbox/";
    secretToken = process.env.SANDBOX_TOKEN;
  }

  const socketURL = "wss://api-invest.tinkoff.ru/openapi/md/v1/md-openapi/ws";
  const result = new OpenAPI({ apiURL, secretToken, socketURL });

  // Patching the existing API to support market orders
  result.marketOrder = ({ figi, lots, operation }) =>
    // @ts-ignore
    result.makeRequest(`/orders/market-order?figi=${figi}`, {
      method: "post",
      params: {
        lots,
        operation,
      },
    });

  return result;
}
