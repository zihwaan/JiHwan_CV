import axios from 'axios';
import dbConnect from './db';
import Token from '../models/Token';

const KIS_APP_KEY = process.env.KIS_APP_KEY!;
const KIS_APP_SECRET = process.env.KIS_APP_SECRET!;
const KIS_BASE_URL = process.env.KIS_BASE_URL!;
const KIS_ACCOUNT_NO = process.env.KIS_ACCOUNT_NO!;

class KisService {
  private static instance: KisService;

  private constructor() {}

  public static getInstance(): KisService {
    if (!KisService.instance) {
      KisService.instance = new KisService();
    }
    return KisService.instance;
  }

  private async getAccessToken(): Promise<string> {
    await dbConnect();
    
    // Check for valid existing token (buffer 1 minute)
    const validToken = await Token.findOne({
      expires_at: { $gt: new Date(Date.now() + 60 * 1000) }
    }).sort({ expires_at: -1 });

    if (validToken) {
      return validToken.access_token;
    }

    // Request new token
    try {
      const response = await axios.post(`${KIS_BASE_URL}/oauth2/tokenP`, {
        grant_type: 'client_credentials',
        appkey: KIS_APP_KEY,
        appsecret: KIS_APP_SECRET,
      });

      const { access_token, token_type, expires_in, access_token_token_expired } = response.data;

      // Create new token record
      // access_token_token_expired format: "2025-05-27 15:00:00"
      // We can also use expires_in (seconds)
      const expiresAt = new Date(Date.now() + expires_in * 1000);

      await Token.create({
        access_token,
        token_type,
        expires_in,
        expires_at: expiresAt,
      });

      return access_token;
    } catch (error) {
      console.error('Failed to get KIS access token:', error);
      throw new Error('Authentication failed');
    }
  }

  private async getHeaders(tr_id: string) {
    const token = await this.getAccessToken();
    return {
      'Content-Type': 'application/json',
      'authorization': `Bearer ${token}`,
      'appkey': KIS_APP_KEY,
      'appsecret': KIS_APP_SECRET,
      'tr_id': tr_id,
      'custtype': 'P',
    };
  }

  async getCurrentPrice(code: string) {
    const tr_id = 'FHKST01010100';
    const headers = await this.getHeaders(tr_id);
    
    try {
      const response = await axios.get(`${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price`, {
        headers,
        params: {
          FID_COND_MRKT_DIV_CODE: 'J',
          FID_INPUT_ISCD: code,
        },
      });
      
      if (response.data.rt_cd !== '0') {
         throw new Error(response.data.msg1 || 'API Error');
      }

      return response.data.output;
    } catch (error) {
      console.error(`Error fetching price for ${code}:`, error);
      throw error;
    }
  }

  async getDailyPrice(code: string, period: 'D' | 'W' | 'M' = 'D') {
    const tr_id = 'FHKST01010400';
    const headers = await this.getHeaders(tr_id);

    try {
      const response = await axios.get(`${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-price`, {
        headers,
        params: {
          FID_COND_MRKT_DIV_CODE: 'J',
          FID_INPUT_ISCD: code,
          FID_PERIOD_DIV_CODE: period,
          FID_ORG_ADJ_PRC: '1', // Adjusted price
        },
      });

      if (response.data.rt_cd !== '0') {
        throw new Error(response.data.msg1 || 'API Error');
     }

      return response.data.output;
    } catch (error) {
      console.error(`Error fetching daily price for ${code}:`, error);
      throw error;
    }
  }

  async getAccountBalance() {
    const tr_id = 'TTTC8434R'; // Real account
    const headers = await this.getHeaders(tr_id);
    
    // Account format: 12345678-01 -> CANO=12345678, PRDT=01
    const cano = KIS_ACCOUNT_NO.substring(0, 8);
    const prdt = '01'; // Usually 01

    try {
      const response = await axios.get(`${KIS_BASE_URL}/uapi/domestic-stock/v1/trading/inquire-balance`, {
        headers,
        params: {
          CANO: cano,
          ACNT_PRDT_CD: prdt,
          AFHR_FLPR_YN: 'N',
          INQR_DVSN: '02',
          UNPR_DVSN: '01',
          FUND_STTL_ICLD_YN: 'N',
          FNCG_AMT_AUTO_RDPT_YN: 'N',
          PRCS_DVSN: '00',
          CTX_AREA_FK100: '',
          CTX_AREA_NK100: '',
        },
      });

      if (response.data.rt_cd !== '0') {
        throw new Error(response.data.msg1 || 'API Error');
     }

      return response.data;
    } catch (error) {
      console.error('Error fetching account balance:', error);
      throw error;
    }
  }
}

export default KisService.getInstance();
