import { Provider, ProviderId, ProviderSpec, Product } from '../core/types';
import registry from './models.json';
export type Role = keyof typeof registry.roles;
export interface ResolvedModel {
    model: string;
    provider: ProviderId;
    providerSpec: ProviderSpec;
}
export interface CatalogEntry {
    model: string;
    provider: string;
    measuredEngine: boolean;
}
export declare function resolveRole(role: Role, product?: Product): ResolvedModel[];
export declare function requiredEnvKeys(role: Role, product?: Product): string[];
export declare function envKeyOf(provider: ProviderId): string;
export declare function providerSpecOf(provider: ProviderId): ProviderSpec;
export declare function modelCatalog(): CatalogEntry[];
export declare function roles(): Role[];
export declare function providerIds(): {
    id: string;
    verified: boolean;
    callable: boolean;
}[];
export declare const REGISTRY_VERSION: number;
export type { Provider, ProviderId, ProviderSpec };
