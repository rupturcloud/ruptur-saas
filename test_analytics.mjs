import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { AnalyticsService } from './modules/billing/analytics.service.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const analytics = new AnalyticsService(supabase);

analytics.getDashboardMetrics('1dd1e608-0c6c-4956-bfaa-db85a0a4d586')
  .then(res => console.log('SUCCESS:', res))
  .catch(err => console.error('ERROR:', err.message));
