import { MenuItemConstructorOptions } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { MenuItemConstructorOptionsIpc } from '../../main_process/types';
import {
  subscribeMenuClick,
  unsubscribeAllMenuClick,
  setMenu as setMenuIpc,
} from '../../ipc/ipc_renderer';
import React, { useEffect } from 'react';

function transformReactMenuTreeToMenuItemConstructorOptions(
  children: MenuChildren
): MenuItemConstructorOptions[] {
  if (!Array.isArray(children)) {
    children = [children];
  }
  return children.map((x) => {
    if (x.type == MenuItem) {
      const props = x.props as MenuItemProps;
      return { label: props.label, accelerator: props.accelerator, click: props.callback };
    } else if (x.type == MenuCheckbox) {
      const props = x.props as MenuCheckboxProps;
      return {
        type: 'checkbox',
        checked: props.checked,
        label: props.label,
        accelerator: props.accelerator,
        click: props.callback,
      };
    } else if (x.type == MenuSeparator) {
      return { type: 'separator' };
    } else if (x.type == MenuGroup) {
      const props = x.props as MenuGroupProps;
      return {
        label: props.label,
        submenu: transformReactMenuTreeToMenuItemConstructorOptions(props.children),
      };
    } else {
      throw Error('Unknown component encountered in Menubar');
    }
  });
}

export function MenuBar({ children }: { children: MenuChildren }): JSX.Element {
  useEffect(() => () => {
    // this will be called on unmount
    setMenu([]);
  });

  const transformed = transformReactMenuTreeToMenuItemConstructorOptions(children);
  useEffect(() => {
    // we defer the setMenu using requestAnimationFrame to make sure it is executed after potential unmounts and menu
    // the above setMenu([])
    requestAnimationFrame(() => {
      setMenu(transformed);
    });
  }, [JSON.stringify(transformed)]);

  return <></>;
}

type MenuChildren = MenuChild[] | MenuChild;
type MenuChild = React.FunctionComponentElement<
  MenuItemProps | MenuCheckboxProps | MenuSeparatorProps | MenuGroupProps
>;
interface MenuItemProps {
  label: string;
  accelerator?: string;
  callback: () => void;
}
export function MenuItem(_props: MenuItemProps): JSX.Element {
  return <></>;
}
interface MenuCheckboxProps {
  label: string;
  accelerator?: string;
  checked: boolean;
  callback: () => void;
}
export function MenuCheckbox(_props: MenuCheckboxProps): JSX.Element {
  return <></>;
}
type MenuSeparatorProps = Record<string, never>;
export function MenuSeparator(_props: MenuSeparatorProps): JSX.Element {
  return <></>;
}
interface MenuGroupProps {
  children: MenuChildren;
  label: string;
}
export function MenuGroup(_props: MenuGroupProps): JSX.Element {
  return <></>;
}

export function setMenu(menu: MenuItemConstructorOptions[]): void {
  const listeners: Record<string, () => void> = {};
  const transformMenuTemplate = (
    x: MenuItemConstructorOptions[]
  ): MenuItemConstructorOptionsIpc[] => {
    const transformClick = (click: (...args: any) => void): string | undefined => {
      const uuid = uuidv4();
      listeners[uuid] = click;
      return uuid;
    };
    return x.map(
      (x) =>
        ({
          ...x,
          click: x.click && transformClick(x.click),
          submenu: x.submenu && transformMenuTemplate(x.submenu as MenuItemConstructorOptions[]),
        } as MenuItemConstructorOptionsIpc)
    );
  };
  const transformed = transformMenuTemplate(menu);

  unsubscribeAllMenuClick();
  subscribeMenuClick((uuid) => {
    listeners[uuid]();
  });
  setMenuIpc(transformed);
}
