import { helper } from './helper.js';

export function add(a: number, b: number): number {
  return helper(a) + b;
}

export class Calculator {
  private total = 0;

  add(value: number): number {
    this.total += value;
    return this.total;
  }
}

export const multiply = (a: number, b: number): number => a * b;

export interface Point {
  x: number;
  y: number;
}

export type Id = string | number;
