import { makeStore } from '../shared/storage';

export const store = makeStore('lantern.');
export const { load, save } = store;
