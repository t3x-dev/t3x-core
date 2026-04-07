import type { OpRegistry } from '../registry';

import { defineHandler } from './define';
import { dropHandler } from './drop';
import { renameHandler } from './rename';
import { setHandler } from './set';
import { unsetHandler } from './unset';
import { populateHandler } from './populate';
import { appendHandler } from './append';
import { moveHandler } from './move';
import { cloneHandler } from './clone';
import { nestHandler } from './nest';
import { splitHandler } from './split';
import { foldHandler } from './fold';
import { mergeHandler } from './merge';
import { sortHandler } from './sort';
import { uniqueHandler } from './unique';
import { pickHandler } from './pick';
import { omitHandler } from './omit';
import { assertHandler } from './assert';

export function registerAllHandlers(registry: OpRegistry): void {
  registry.register('define', defineHandler);
  registry.register('drop', dropHandler);
  registry.register('rename', renameHandler);
  registry.register('set', setHandler);
  registry.register('unset', unsetHandler);
  registry.register('populate', populateHandler);
  registry.register('append', appendHandler);
  registry.register('move', moveHandler);
  registry.register('clone', cloneHandler);
  registry.register('nest', nestHandler);
  registry.register('split', splitHandler);
  registry.register('fold', foldHandler);
  registry.register('merge', mergeHandler);
  registry.register('sort', sortHandler);
  registry.register('unique', uniqueHandler);
  registry.register('pick', pickHandler);
  registry.register('omit', omitHandler);
  registry.register('assert', assertHandler);
}

export {
  defineHandler,
  dropHandler,
  renameHandler,
  setHandler,
  unsetHandler,
  populateHandler,
  appendHandler,
  moveHandler,
  cloneHandler,
  nestHandler,
  splitHandler,
  foldHandler,
  mergeHandler,
  sortHandler,
  uniqueHandler,
  pickHandler,
  omitHandler,
  assertHandler,
};
