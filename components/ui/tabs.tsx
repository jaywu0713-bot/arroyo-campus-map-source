import { Tabs as Base } from '@base-ui/react/tabs';
import type { ComponentProps } from 'react';
export const Tabs = Base.Root;
export function TabsList(props:ComponentProps<typeof Base.List>){return <Base.List data-slot="tabs-list" {...props}/>}
export function TabsTrigger(props:ComponentProps<typeof Base.Tab>){return <Base.Tab data-slot="tabs-trigger" {...props}/>}
