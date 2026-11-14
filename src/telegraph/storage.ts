import { makeStore } from '../shared/storage';

export const store = makeStore('telegraph.');
export const { load, save } = store;
