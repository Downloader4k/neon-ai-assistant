import axios from 'axios';
import { prisma } from '../db/prisma';
import { logger } from '../../utils/logger';

const CURRENCY_KEY = 'usd_eur_rate';
const UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export class CurrencyService {
    private cachedRate: number | null = null;
    private lastUpdate: number = 0;

    constructor() {
        this.init();
    }

    private async init() {
        await this.loadRate();
    }

    /**
     * Get current USD -> EUR rate (cached or fresh)
     */
    async getRate(): Promise<number> {
        // If in memory and fresh, return
        if (this.cachedRate && (Date.now() - this.lastUpdate < UPDATE_INTERVAL_MS)) {
            return this.cachedRate;
        }

        // Try load from DB
        await this.loadRate();

        // If still old or missing, fetch new
        if (!this.cachedRate || (Date.now() - this.lastUpdate > UPDATE_INTERVAL_MS)) {
            await this.fetchRate();
        }

        return this.cachedRate || 0.95; // Fallback
    }

    /**
     * Load rate from DB
     */
    private async loadRate() {
        try {
            const pref = await prisma.userPreference.findFirst({
                where: { key: CURRENCY_KEY }
            });

            if (pref) {
                this.cachedRate = parseFloat(pref.value);
                this.lastUpdate = pref.updatedAt.getTime();
            }
        } catch (error) {
            logger.warn('Failed to load currency rate from DB', error);
        }
    }

    /**
     * Fetch fresh rate from API (frankfurter.app)
     */
    private async fetchRate() {
        try {
            logger.info('Fetching fresh currency rate (USD -> EUR)...');
            const res = await axios.get('https://api.frankfurter.app/latest?from=USD&to=EUR');
            
            if (res.data && res.data.rates && res.data.rates.EUR) {
                const newRate = res.data.rates.EUR;
                this.cachedRate = newRate;
                this.lastUpdate = Date.now();

                // Save to DB
                await prisma.userPreference.upsert({
                    where: { userId_key: { userId: 'system', key: CURRENCY_KEY } },
                    update: { value: String(newRate), updatedAt: new Date() },
                    create: { userId: 'system', key: CURRENCY_KEY, value: String(newRate), category: 'system' }
                });

                logger.info(`Updated currency rate: 1 USD = ${newRate} EUR`);
            }
        } catch (error) {
            logger.error('Failed to fetch currency rate', error);
        }
    }

    /**
     * Convert amount
     */
    async convertUsdToEur(amount: number): Promise<number> {
        const rate = await this.getRate();
        return amount * rate;
    }
}

export const currencyService = new CurrencyService();
