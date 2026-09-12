import type { ComponentProps } from 'react';
export function Button({variant='default',size='default',className='',...props}:ComponentProps<'button'> & {variant?:string;size?:string}) {
  return <button type="button" className={`ui-button ui-${variant} ui-${size} ${className}`} {...props}/>;
}
