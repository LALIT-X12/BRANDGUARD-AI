import type { User } from '../types';
const BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '');
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
export class ApiError extends Error { constructor(message:string, public status?:number){super(message);this.name='ApiError';} }
let accessToken: string | null = null;
export const tokenStore = {get:()=>accessToken,set:(v:string|null)=>{accessToken=v;}};
/** Contract-driven client. Endpoint paths are intentionally not guessed; see docs/API_INTEGRATION_MAP.md. */
export async function request<T>(path:string, init:RequestInit={}):Promise<T>{
  if(!path.startsWith('/')) throw new Error('API paths must be absolute paths beginning with /.');
  const headers = new Headers(init.headers); if(!(init.body instanceof FormData) && init.body) headers.set('Content-Type','application/json');
  if(accessToken) headers.set('Authorization',`Bearer ${accessToken}`);
  let response:Response; try { response=await fetch(`${BASE}${path}`,{...init,headers,credentials:'include'}); } catch { throw new ApiError('Cannot reach the BrandGuard API. Check that FastAPI is running and CORS permits this origin.'); }
  if(response.status===204) return undefined as T;
  const payload=await response.json().catch(()=>null);
  if(!response.ok) throw new ApiError(payload?.detail || payload?.message || `Request failed (${response.status}).`,response.status);
  return payload as T;
}
export const api = { baseUrl:BASE, request };
export interface AuthAdapter { login(email:string,password:string):Promise<{user:User;accessToken?:string}>; register(input:Record<string,string>):Promise<void>; forgotPassword(email:string):Promise<void>; resetPassword(token:string,password:string):Promise<void>; }
/** Wire these methods only after confirming backend schemas and paths. */
export const authAdapter:AuthAdapter = {
  async login(){throw new ApiError('Authentication API contract is not mapped yet. See docs/API_INTEGRATION_MAP.md.');},
  async register(){throw new ApiError('Registration API contract is not mapped yet.');},
  async forgotPassword(){throw new ApiError('Password recovery API contract is not mapped yet.');},
  async resetPassword(){throw new ApiError('Password reset API contract is not mapped yet.');}
};
