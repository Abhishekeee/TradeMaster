import type { Instrument } from './types';

const y = (id: string, name: string, kind: string): Instrument => ({ id, name, source: 'yahoo', kind });
const b = (id: string, name: string): Instrument => ({ id, name, source: 'binance', kind: 'CRYPTO' });

/** Which part of the world the chart, search and market lists focus on. India is the default; All behaves like the original app. */
export type MarketId = 'IN' | 'US' | 'CRYPTO' | 'GLOBAL' | 'ALL';
export const MARKETS: { id: MarketId; label: string; hint: string }[] = [
  { id: 'IN', label: 'India', hint: 'NSE / BSE stocks, indices, ETFs and options' },
  { id: 'US', label: 'US', hint: 'US stocks, ETFs, indices and options' },
  { id: 'CRYPTO', label: 'Crypto', hint: 'Bitcoin, Ethereum and other coins' },
  { id: 'GLOBAL', label: 'Global', hint: 'Forex, commodities, futures and world indices' },
  { id: 'ALL', label: 'All markets', hint: 'Everything, as before' },
];

export interface Category { id: string; label: string; items: Instrument[]; markets: MarketId[] }

export const CATEGORIES: Category[] = [
  { id: 'in', label: 'Top Indian stocks', markets: ['IN', 'ALL'], items: [
    ['RELIANCE.NS', 'Reliance Industries'], ['TCS.NS', 'TCS'], ['HDFCBANK.NS', 'HDFC Bank'], ['INFY.NS', 'Infosys'], ['ICICIBANK.NS', 'ICICI Bank'],
    ['SBIN.NS', 'State Bank of India'], ['BHARTIARTL.NS', 'Bharti Airtel'], ['ITC.NS', 'ITC'], ['LT.NS', 'Larsen & Toubro'], ['HINDUNILVR.NS', 'Hindustan Unilever'],
    ['AXISBANK.NS', 'Axis Bank'], ['KOTAKBANK.NS', 'Kotak Bank'], ['BAJFINANCE.NS', 'Bajaj Finance'], ['MARUTI.NS', 'Maruti Suzuki'], ['SUNPHARMA.NS', 'Sun Pharma'],
    ['TATASTEEL.NS', 'Tata Steel'], ['WIPRO.NS', 'Wipro'], ['ONGC.NS', 'ONGC'], ['ADANIENT.NS', 'Adani Enterprises'],
    ['ASIANPAINT.NS', 'Asian Paints'], ['TITAN.NS', 'Titan'], ['ULTRACEMCO.NS', 'UltraTech Cement'], ['NESTLEIND.NS', 'Nestle India'], ['HCLTECH.NS', 'HCL Technologies'],
    ['POWERGRID.NS', 'Power Grid'], ['NTPC.NS', 'NTPC'], ['M&M.NS', 'Mahindra & Mahindra'], ['JSWSTEEL.NS', 'JSW Steel'], ['ADANIPORTS.NS', 'Adani Ports'],
    ['COALINDIA.NS', 'Coal India'], ['BAJAJFINSV.NS', 'Bajaj Finserv'], ['TECHM.NS', 'Tech Mahindra'], ['GRASIM.NS', 'Grasim'], ['CIPLA.NS', 'Cipla'],
    ['DRREDDY.NS', 'Dr. Reddy\'s'], ['EICHERMOT.NS', 'Eicher Motors'], ['HEROMOTOCO.NS', 'Hero MotoCorp'], ['BRITANNIA.NS', 'Britannia'], ['APOLLOHOSP.NS', 'Apollo Hospitals'],
    ['DIVISLAB.NS', 'Divi\'s Laboratories'], ['HINDALCO.NS', 'Hindalco'], ['INDUSINDBK.NS', 'IndusInd Bank'], ['BPCL.NS', 'BPCL'], ['TATACONSUM.NS', 'Tata Consumer'],
    ['SBILIFE.NS', 'SBI Life'], ['HDFCLIFE.NS', 'HDFC Life'], ['SHRIRAMFIN.NS', 'Shriram Finance'], ['TRENT.NS', 'Trent'], ['BEL.NS', 'Bharat Electronics'],
    ['HAL.NS', 'Hindustan Aeronautics'], ['JIOFIN.NS', 'Jio Financial'], ['BAJAJ-AUTO.NS', 'Bajaj Auto'], ['LUPIN.NS', 'Lupin'], ['ETERNAL.NS', 'Eternal (Zomato)'],
  ].map(([i, n]) => y(i, n, 'EQUITY')) },
  { id: 'idxin', label: 'India indices', markets: ['IN'], items: [
    ['^NSEI', 'Nifty 50'], ['^NSEBANK', 'Bank Nifty'], ['^BSESN', 'Sensex'], ['^CNXIT', 'Nifty IT'], ['^CNXPHARMA', 'Nifty Pharma'], ['^CNXAUTO', 'Nifty Auto'],
    ['^CNXFMCG', 'Nifty FMCG'], ['^CNXENERGY', 'Nifty Energy'], ['^CNXMETAL', 'Nifty Metal'], ['^CNXREALTY', 'Nifty Realty'], ['^CNXINFRA', 'Nifty Infrastructure'], ['^CNXPSUBANK', 'Nifty PSU Bank'],
  ].map(([i, n]) => y(i, n, 'INDEX')) },
  { id: 'etfin', label: 'India ETFs', markets: ['IN'], items: [
    ['NIFTYBEES.NS', 'Nifty 50 ETF'], ['BANKBEES.NS', 'Bank Nifty ETF'], ['JUNIORBEES.NS', 'Nifty Next 50 ETF'], ['MID150BEES.NS', 'Nifty Midcap 150 ETF'], ['ITBEES.NS', 'Nifty IT ETF'],
    ['GOLDBEES.NS', 'Gold ETF'], ['SILVERBEES.NS', 'Silver ETF'], ['MON100.NS', 'Nasdaq 100 ETF'],
  ].map(([i, n]) => y(i, n, 'ETF')) },
  { id: 'fxin', label: 'Rupee pairs', markets: ['IN'], items: [
    ['USDINR=X', 'USD / INR'], ['EURINR=X', 'EUR / INR'], ['GBPINR=X', 'GBP / INR'], ['JPYINR=X', 'JPY / INR'],
  ].map(([i, n]) => y(i, n, 'CURRENCY')) },
  { id: 'us', label: 'US Stocks', markets: ['US', 'ALL'], items: [
    ['AAPL', 'Apple'], ['MSFT', 'Microsoft'], ['NVDA', 'NVIDIA'], ['GOOGL', 'Alphabet'], ['AMZN', 'Amazon'], ['META', 'Meta'], ['TSLA', 'Tesla'],
    ['AMD', 'AMD'], ['NFLX', 'Netflix'], ['JPM', 'JPMorgan'], ['BAC', 'Bank of America'], ['DIS', 'Disney'], ['KO', 'Coca-Cola'], ['WMT', 'Walmart'],
    ['XOM', 'Exxon Mobil'], ['PFE', 'Pfizer'], ['BA', 'Boeing'], ['INTC', 'Intel'], ['UBER', 'Uber'], ['COIN', 'Coinbase'], ['SPY', 'S&P 500 ETF'], ['QQQ', 'Nasdaq 100 ETF'],
  ].map(([i, n]) => y(i, n, i === 'SPY' || i === 'QQQ' ? 'ETF' : 'EQUITY')) },
  { id: 'idxus', label: 'US indices', markets: ['US'], items: [
    ['^GSPC', 'S&P 500'], ['^IXIC', 'Nasdaq Composite'], ['^DJI', 'Dow Jones'], ['^RUT', 'Russell 2000'], ['^VIX', 'VIX Volatility'],
  ].map(([i, n]) => y(i, n, 'INDEX')) },
  { id: 'idx', label: 'World indices', markets: ['GLOBAL', 'ALL'], items: [
    ['^NSEI', 'Nifty 50'], ['^NSEBANK', 'Bank Nifty'], ['^BSESN', 'Sensex'], ['^GSPC', 'S&P 500'], ['^IXIC', 'Nasdaq Composite'], ['^DJI', 'Dow Jones'],
    ['^RUT', 'Russell 2000'], ['^FTSE', 'FTSE 100'], ['^GDAXI', 'DAX'], ['^N225', 'Nikkei 225'], ['^HSI', 'Hang Seng'], ['^VIX', 'VIX Volatility'],
  ].map(([i, n]) => y(i, n, 'INDEX')) },
  { id: 'com', label: 'Commodities', markets: ['GLOBAL', 'ALL'], items: [
    ['GC=F', 'Gold'], ['SI=F', 'Silver'], ['CL=F', 'Crude Oil WTI'], ['BZ=F', 'Brent Crude'], ['NG=F', 'Natural Gas'], ['HG=F', 'Copper'],
    ['PL=F', 'Platinum'], ['PA=F', 'Palladium'], ['ZC=F', 'Corn'], ['ZW=F', 'Wheat'], ['ZS=F', 'Soybeans'], ['KC=F', 'Coffee'], ['SB=F', 'Sugar'], ['CT=F', 'Cotton'],
  ].map(([i, n]) => y(i, n + ' futures', 'FUTURE')) },
  { id: 'fut', label: 'Futures', markets: ['GLOBAL', 'ALL'], items: [
    ['ES=F', 'E-mini S&P 500'], ['NQ=F', 'E-mini Nasdaq 100'], ['YM=F', 'E-mini Dow'], ['RTY=F', 'E-mini Russell 2000'],
    ['ZB=F', 'US 30Y T-Bond'], ['ZN=F', 'US 10Y T-Note'], ['ZF=F', 'US 5Y T-Note'], ['GC=F', 'Gold'], ['CL=F', 'Crude Oil'], ['NG=F', 'Natural Gas'], ['DX=F', 'US Dollar Index'],
  ].map(([i, n]) => y(i, n, 'FUTURE')) },
  { id: 'fx', label: 'Forex', markets: ['GLOBAL', 'ALL'], items: [
    ['EURUSD=X', 'EUR / USD'], ['GBPUSD=X', 'GBP / USD'], ['USDJPY=X', 'USD / JPY'], ['USDINR=X', 'USD / INR'], ['AUDUSD=X', 'AUD / USD'], ['USDCAD=X', 'USD / CAD'],
    ['USDCHF=X', 'USD / CHF'], ['NZDUSD=X', 'NZD / USD'], ['EURINR=X', 'EUR / INR'], ['GBPINR=X', 'GBP / INR'], ['EURGBP=X', 'EUR / GBP'], ['EURJPY=X', 'EUR / JPY'], ['GBPJPY=X', 'GBP / JPY'],
  ].map(([i, n]) => y(i, n, 'CURRENCY')) },
  { id: 'crypto', label: 'Crypto', markets: ['CRYPTO', 'ALL'], items: [
    ['BTCUSDT', 'Bitcoin'], ['ETHUSDT', 'Ethereum'], ['BNBUSDT', 'BNB'], ['SOLUSDT', 'Solana'], ['XRPUSDT', 'XRP'], ['ADAUSDT', 'Cardano'], ['DOGEUSDT', 'Dogecoin'],
    ['AVAXUSDT', 'Avalanche'], ['LINKUSDT', 'Chainlink'], ['TRXUSDT', 'TRON'], ['DOTUSDT', 'Polkadot'], ['LTCUSDT', 'Litecoin'], ['SHIBUSDT', 'Shiba Inu'], ['PEPEUSDT', 'Pepe'],
  ].map(([i, n]) => b(i, n)) },
];

/** The first chart shown when someone switches to a market. */
export const DEFAULT_INST: Record<MarketId, Instrument> = {
  IN: y('RELIANCE.NS', 'Reliance Industries · NSE', 'EQUITY'),
  US: y('AAPL', 'Apple · NASDAQ', 'EQUITY'),
  CRYPTO: b('BTCUSDT', 'Crypto · Binance'),
  GLOBAL: y('GC=F', 'Gold futures', 'FUTURE'),
  ALL: y('RELIANCE.NS', 'Reliance Industries · NSE', 'EQUITY'),
};

/** The market chosen on either page, remembered in the browser (India until someone picks another). */
export function loadMarket(): MarketId {
  try { const m = JSON.parse(localStorage.getItem('tm') || '{}').market; return MARKETS.some((x) => x.id === m) ? m : 'IN'; } catch { return 'IN'; }
}
/** Remember the market, and move the saved chart to that market's default if it does not belong to it. */
export function saveMarket(m: MarketId) {
  try {
    const t = JSON.parse(localStorage.getItem('tm') || '{}');
    localStorage.setItem('tm', JSON.stringify({ ...t, market: m, inst: t.inst && inMarket(t.inst, m) ? t.inst : DEFAULT_INST[m] }));
  } catch { /* ignore */ }
}

export const categoriesFor = (m: MarketId) => CATEGORIES.filter((c) => c.markets.includes(m));

/** Does this instrument belong to the chosen market? Used to filter search results and decide whether to switch the chart. */
export function inMarket(i: Instrument, m: MarketId): boolean {
  if (m === 'ALL') return true;
  const id = i.id;
  const crypto = i.source === 'binance' || i.kind === 'CRYPTO' || i.kind === 'CRYPTOCURRENCY';
  const india = i.source === 'nse' || /\.(NS|BO)$/.test(id) || /^\^(NSE|BSE|CNX)/.test(id) || /INR=X$/.test(id);
  const world = /=X$|=F$/.test(id) || i.kind === 'CURRENCY' || i.kind === 'FUTURE';
  const usIndex = ['^GSPC', '^IXIC', '^DJI', '^RUT', '^VIX'].includes(id);
  const us = !india && !crypto && !world && (usIndex || (!id.startsWith('^') && !/\.[A-Z]{1,3}$/.test(id)));
  if (m === 'IN') return india;
  if (m === 'US') return us;
  if (m === 'CRYPTO') return crypto;
  return !india && !crypto && !us; // GLOBAL: forex, commodities, futures, other countries' stocks and indices
}
