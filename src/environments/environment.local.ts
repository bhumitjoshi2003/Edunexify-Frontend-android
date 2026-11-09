import { Environment } from './environment.model';

// Use this for local testing: npm run build:local
// Make sure the backend allows CORS from the phone's origin (no origin check for HTTP)
export const environment: Environment = {
  baseDomain: 'edunexify.co.in',
    production: false,
    apiUrl: 'http://192.168.1.9:8080/api'
};
