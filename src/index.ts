import { figiUSD } from "./const";
import getAPI from "./lib/api";
import { info } from "./lib/logger";

require("dotenv").config();

const api = getAPI();
const isProduction = process.env.PRODUCTION === "true";

if (isProduction) info("*** PRODUCTION MODE ***");

(async function () {
  try {
    const portfolio = await api.portfolio();
    const { positions } = portfolio;

    // const usd = positions.find((el) => el.figi === figiUSD);

    info(positions);
    // info(usd);
  } catch (err) {
    info("FATAL", err);
  }
})();
