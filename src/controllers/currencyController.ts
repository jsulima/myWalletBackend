import { Request, Response } from 'express';
import { fetchCurrencyRates } from '../services/currencyService';

export const getCurrencyRates = async (req: Request, res: Response) => {
  try {
    const rates = await fetchCurrencyRates();
    res.json(rates);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch currency rates' });
  }
};
