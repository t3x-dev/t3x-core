import type { OpRegistry } from '../registry';
import { appendHandler } from './append';
import { assertHandler } from './assert';
import { cloneHandler } from './clone';
import { defineHandler } from './define';
import { dropHandler } from './drop';
import { foldHandler } from './fold';
import { mergeHandler } from './merge';
import { moveHandler } from './move';
import { nestHandler } from './nest';
import { omitHandler } from './omit';
import { pickHandler } from './pick';
import { populateHandler } from './populate';
import { renameHandler } from './rename';
import { setHandler } from './set';
import { sortHandler } from './sort';
import { splitHandler } from './split';
import { uniqueHandler } from './unique';
import { unsetHandler } from './unset';

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
