import type { BuildItem, BuildTemplate } from './build-session';
export type BuildTool = 'translate' | 'rotate' | 'scale';
export type BuilderState = {
  active: boolean; tool: BuildTool; snap: boolean; pending: string | null;
  catalog: BuildTemplate[]; selected: (BuildItem & { name: string }) | null;
  added: number; changed: number; canUndo: boolean; canRedo: boolean; warnings: string[];
};
export const emptyBuilderState: BuilderState = { active:false,tool:'translate',snap:true,pending:null,catalog:[],selected:null,added:0,changed:0,canUndo:false,canRedo:false,warnings:[] };
