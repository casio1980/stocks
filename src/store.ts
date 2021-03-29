import { Status } from './types'
import { makeAutoObservable, makeObservable, observable, action, computed } from "mobx"
import { CandleStreaming, PortfolioPosition } from "@tinkoff/invest-openapi-js-sdk";
import { fmtNumber } from "./lib/utils";
import { STATUS_IDLE } from "./const";

export class Store {
  status: Status = STATUS_IDLE
  position?: PortfolioPosition = undefined
  buyCandle?: CandleStreaming = undefined

  candles: CandleStreaming[] = undefined

  constructor(candles: CandleStreaming[]) {
    // makeAutoObservable(this)
    makeObservable(this, {
      candles: observable.ref,

      status: observable,
      position: observable,
      buyCandle: observable,

      isIdle: computed,
      hasPosition: computed,
      lotsAvailable: computed,
      buyTime: computed,
      buyPrice: computed,
      takePrice: computed,
      stopPrice: computed,

      setStatus: action,
      setPosition: action,
      setBuyCandle: action
    })
    this.candles = candles
  }

  get isIdle() {
    return this.status === STATUS_IDLE
  }

  get hasPosition() {
    return !!this.position
  }

  get lotsAvailable() {
    return this.position?.lots || 0
  }

  get buyTime() {
    return this.buyCandle?.time
  }

  get buyPrice() {
    return this.position?.averagePositionPrice?.value || this.buyCandle?.c
  }

  get takePrice() {
    return fmtNumber(this.buyPrice + 0.7)
  }

  get stopPrice() {
    const { candles, buyTime } = this
    const buyCandleIndex = candles.findIndex(c => c.time === buyTime)
    const prevBuyCandle = candles[buyCandleIndex - 1]

    const initialStop = fmtNumber(prevBuyCandle.o - 0.05) // 0.2

    const nCount = 32 // 25
    const nCandles = candles.slice(Math.max(candles.length - nCount - 1, 0), candles.length - 1)
    const nLow = nCandles.length === nCount ? Number(Math.min(...nCandles.map(c => c.l)).toFixed(1)) : 0 // TODO fmtNumber

    return Math.max(nLow, initialStop)
  }

  setStatus(status: Status) {
    this.status = status
  }

  setPosition(position: PortfolioPosition) {
    this.position = position
  }

  setBuyCandle(candle: CandleStreaming) {
    this.buyCandle = candle
  }
}