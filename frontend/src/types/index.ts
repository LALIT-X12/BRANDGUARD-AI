export type Role = 'Creator'|'Reviewer'|'Brand Admin'|'Tenant Admin';
export type Status = 'Draft'|'Submitted'|'Queued'|'Processing'|'Completed'|'Changes Requested'|'Approved'|'Rejected'|'Failed';
export type Severity = 'Critical'|'High'|'Medium'|'Low'|'Informational';
export interface User { id:string; name:string; email:string; role:Role; tenantName:string }
export interface Submission { id:string; campaign:string; platform:string; category:string; filename:string; submittedAt:string; status:Status; submittedBy:string; description?:string }
export interface Finding { id:string; title:string; description:string; severity:Severity; source?:string; location?:string; suggestion?:string; confidence?:number; kind?:'Rule-based'|'AI-assisted' }
export interface Claim { id:string; title:string; description:string; status:'Supported'|'Contradicted'|'Outdated'|'Unsupported'|'Needs legal review'; expiresAt?:string; reference?:string }
export interface GlossaryTerm { id:string; term:string; type:'Approved'|'Restricted'; definition:string; replacement?:string }
export interface Guideline { id:string; title:string; category:string; description:string; updatedAt:string }
export interface AuditEvent { id:string; actor:string; action:string; target:string; timestamp:string; detail:string }
