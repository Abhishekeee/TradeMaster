import type { Instrument } from './types';

const y = (id: string, name: string, kind: string): Instrument => ({ id, name, source: 'yahoo', kind });
const b = (id: string, name: string): Instrument => ({ id, name, source: 'binance', kind: 'CRYPTO' });

export interface Category { id: string; label: string; items: Instrument[] }

export const CATEGORIES: Category[] = [
  { id: 'us', label: 'US Stocks', items: [
    ['AAPL', 'Apple'], ['MSFT', 'Microsoft'], ['NVDA', 'NVIDIA'], ['GOOGL', 'Alphabet'], ['AMZN', 'Amazon'], ['META', 'Meta'], ['TSLA', 'Tesla'],
    ['AMD', 'AMD'], ['NFLX', 'Netflix'], ['JPM', 'JPMorgan'], ['BAC', 'Bank of America'], ['DIS', 'Disney'], ['KO', 'Coca-Cola'], ['WMT', 'Walmart'],
    ['XOM', 'Exxon Mobil'], ['PFE', 'Pfizer'], ['BA', 'Boeing'], ['INTC', 'Intel'], ['UBER', 'Uber'], ['COIN', 'Coinbase'], ['SPY', 'S&P 500 ETF'], ['QQQ', 'Nasdaq 100 ETF'],
  ].map(([i, n]) => y(i, n, i === 'SPY' || i === 'QQQ' ? 'ETF' : 'EQUITY')) },
  { id: 'in', label: 'India Stocks', items: [
    ['RELIANCE.NS', 'Reliance Industries'], ['TCS.NS', 'TCS'], ['HDFCBANK.NS', 'HDFC Bank'], ['INFY.NS', 'Infosys'], ['ICICIBANK.NS', 'ICICI Bank'],
    ['SBIN.NS', 'State Bank of India'], ['BHARTIARTL.NS', 'Bharti Airtel'], ['ITC.NS', 'ITC'], ['LT.NS', 'Larsen & Toubro'], ['TATAMOTORS.NS', 'Tata Motors'],
    ['TATASTEEL.NS', 'Tata Steel'], ['AXISBANK.NS', 'Axis Bank'], ['KOTAKBANK.NS', 'Kotak Bank'], ['WIPRO.NS', 'Wipro'], ['ADANIENT.NS', 'Adani Enterprises'],
    ['MARUTI.NS', 'Maruti Suzuki'], ['SUNPHARMA.NS', 'Sun Pharma'], ['BAJFINANCE.NS', 'Bajaj Finance'], ['HINDUNILVR.NS', 'Hindustan Unilever'], ['ONGC.NS', 'ONGC'],
  ].map(([i, n]) => y(i, n, 'EQUITY')) },
  { id: 'idx', label: 'Indices', items: [
    ['^NSEI', 'Nifty 50'], ['^NSEBANK', 'Bank Nifty'], ['^BSESN', 'Sensex'], ['^GSPC', 'S&P 500'], ['^IXIC', 'Nasdaq Composite'], ['^DJI', 'Dow Jones'],
    ['^RUT', 'Russell 2000'], ['^FTSE', 'FTSE 100'], ['^GDAXI', 'DAX'], ['^N225', 'Nikkei 225'], ['^HSI', 'Hang Seng'], ['^VIX', 'VIX Volatility'],
  ].map(([i, n]) => y(i, n, 'INDEX')) },
  { id: 'com', label: 'Commodities', items: [
    ['GC=F', 'Gold'], ['SI=F', 'Silver'], ['CL=F', 'Crude Oil WTI'], ['BZ=F', 'Brent Crude'], ['NG=F', 'Natural Gas'], ['HG=F', 'Copper'],
    ['PL=F', 'Platinum'], ['PA=F', 'Palladium'], ['ZC=F', 'Corn'], ['ZW=F', 'Wheat'], ['ZS=F', 'Soybeans'], ['KC=F', 'Coffee'], ['SB=F', 'Sugar'], ['CT=F', 'Cotton'],
  ].map(([i, n]) => y(i, n + ' futures', 'FUTURE')) },
  { id: 'fut', label: 'Futures', items: [
    ['ES=F', 'E-mini S&P 500'], ['NQ=F', 'E-mini Nasdaq 100'], ['YM=F', 'E-mini Dow'], ['RTY=F', 'E-mini Russell 2000'],
    ['ZB=F', 'US 30Y T-Bond'], ['ZN=F', 'US 10Y T-Note'], ['ZF=F', 'US 5Y T-Note'], ['GC=F', 'Gold'], ['CL=F', 'Crude Oil'], ['NG=F', 'Natural Gas'], ['DX=F', 'US Dollar Index'],
  ].map(([i, n]) => y(i, n, 'FUTURE')) },
  { id: 'fx', label: 'Forex', items: [
    ['EURUSD=X', 'EUR / USD'], ['GBPUSD=X', 'GBP / USD'], ['USDJPY=X', 'USD / JPY'], ['USDINR=X', 'USD / INR'], ['AUDUSD=X', 'AUD / USD'], ['USDCAD=X', 'USD / CAD'],
    ['USDCHF=X', 'USD / CHF'], ['NZDUSD=X', 'NZD / USD'], ['EURINR=X', 'EUR / INR'], ['GBPINR=X', 'GBP / INR'], ['EURGBP=X', 'EUR / GBP'], ['EURJPY=X', 'EUR / JPY'], ['GBPJPY=X', 'GBP / JPY'],
  ].map(([i, n]) => y(i, n, 'CURRENCY')) },
  { id: 'crypto', label: 'Crypto', items: [
    ['BTCUSDT', 'Bitcoin'], ['ETHUSDT', 'Ethereum'], ['BNBUSDT', 'BNB'], ['SOLUSDT', 'Solana'], ['XRPUSDT', 'XRP'], ['ADAUSDT', 'Cardano'], ['DOGEUSDT', 'Dogecoin'],
    ['AVAXUSDT', 'Avalanche'], ['LINKUSDT', 'Chainlink'], ['TRXUSDT', 'TRON'], ['DOTUSDT', 'Polkadot'], ['LTCUSDT', 'Litecoin'], ['SHIBUSDT', 'Shiba Inu'], ['PEPEUSDT', 'Pepe'],
  ].map(([i, n]) => b(i, n)) },
];
