import { routes, deploymentEnv, type VercelConfig } from '@vercel/config/v1';

// Vercel project variables: API_DOMAIN
const apiDomain = process.env.API_DOMAIN;
if (!apiDomain) throw new Error('API_DOMAIN is missing (Vercel project variable)');

export const config: VercelConfig = {
  rewrites: [
    routes.rewrite('/api/(.*)', `${apiDomain}/api/$1`, {
      requestHeaders: { authorization: `Bearer ${deploymentEnv('API_TOKEN')}` },
    }),
  ],
};
