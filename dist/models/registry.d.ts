import { Provider, ProviderId, ProviderSpec, Product } from '../core/types';
import compilado from './models.json';
export type Role = keyof typeof compilado.roles;
export interface ResolvedModel {
    model: string;
    provider: ProviderId;
    providerSpec: ProviderSpec;
}
export interface ModelPrice {
    inputPerMTok: number;
    outputPerMTok: number;
    cachedPerMTok?: number;
    intro?: {
        until: string;
        inputPerMTok: number;
        outputPerMTok: number;
        cachedPerMTok?: number;
    };
}
export interface CatalogEntry {
    model: string;
    provider: string;
    measuredEngine: boolean;
    price?: ModelPrice;
}
export declare function resolveRole(role: Role, product?: Product): ResolvedModel[];
export declare function requiredEnvKeys(role: Role, product?: Product): string[];
export declare function envKeyOf(provider: ProviderId): string;
export declare function providerSpecOf(provider: ProviderId): ProviderSpec;
export declare function modelCatalog(): CatalogEntry[];
export declare function modelPrice(model: string): ModelPrice | null;
export declare function roles(): Role[];
export declare function providerIds(): {
    id: string;
    verified: boolean;
    callable: boolean;
}[];
export declare function registryVersion(): number;
export declare const REGISTRY_VERSION: number;
export type { Provider, ProviderId, ProviderSpec };
