import { createContext, useContext } from 'react';
import type { Controller } from './controller';

export const ControllerContext = createContext<Controller | null>(null);

export function useController(): Controller {
  const controller = useContext(ControllerContext);
  if (!controller) throw new Error('Editor controller is missing');
  return controller;
}
