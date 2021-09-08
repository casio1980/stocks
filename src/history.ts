import {
  DATE_FORMAT,
} from "./const";
import { info } from "./lib/logger";
import fs from "fs";
import getAPI from "./lib/api";
import moment from "moment";

require("dotenv").config();

const api = getAPI();

if (process.env.PRODUCTION === "true") info("*** PRODUCTION MODE ***");

//
// DOWNLOAD ROUTINE
//

(async function () {
  try {
    const from = `${moment().startOf("year").subtract(3, 'years').format(DATE_FORMAT)}T00:00:00Z`
    const to = `${moment().add(1, "days").format(DATE_FORMAT)}T00:00:00Z`

    // Downloading history
    info(`Downloading history from ${from} to ${to}...`);
    const { operations } = await api.operations({
      from,
      to
    });

    info(`Processing...`);
    const history = []
    const figis: Array<any> = []
    for (const item of operations) {
      const { figi } = item

      let fg = figis.find(item => item.figi === figi)
      if (!fg && figi) {
        fg = await api.searchOne({ figi })
        figis.push(fg)
      }

      const { ticker } = fg || {}
      const { isMarginCall, id, ...rest } = item
      history.push({ ticker, ...rest })
    }

    const filename = `data/history.json`;
    info(`Writing ${history.length} records to ${filename}...`);
    fs.writeFileSync(filename, JSON.stringify(history), "utf8");

    info("Done.");
  } catch (err) {
    info("FATAL", err);
  }
})();
