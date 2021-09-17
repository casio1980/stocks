import { Candle, CandleStreaming } from "@tinkoff/invest-openapi-js-sdk";
import { MACDOutput } from "technicalindicators/declarations/moving_averages/MACD";
import { STATUS_IDLE, STATUS_BUYING, STATUS_SELLING, STATUS_RETRY_SELLING } from './const'

declare type Status = typeof STATUS_IDLE | typeof STATUS_BUYING | typeof STATUS_SELLING | typeof STATUS_RETRY_SELLING

declare type State = {
  assets: number
  money: number
  price?: number
  positionCount: number
};

declare type DecisionFuncParams = {
  state: State
  candle: Candle
  index: number
  candles: Candle[]
};

declare type Decision = {
  name: string;
  func: (params: DecisionFuncParams) => number | undefined;
};

declare type DecisionFactory = (args?: any) => Decision[];

declare type CandleStreamingMacd = CandleStreaming & { macd?: MACDOutput }
