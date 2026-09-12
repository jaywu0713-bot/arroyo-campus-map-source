import { Dialog as Base } from '@base-ui/react/dialog';
import type { ComponentProps } from 'react';
export const Dialog = Base.Root;
export const DialogTitle = Base.Title;
export const DialogDescription = Base.Description;
export function DialogContent({children,...props}:ComponentProps<typeof Base.Popup>){return <Base.Portal><Base.Backdrop className="dialog-backdrop"/><Base.Popup {...props}>{children}<Base.Close className="ui-button">关闭</Base.Close></Base.Popup></Base.Portal>}
