declare module "franc-min" {
  export function franc(text: string, options?: any): string;
  export function francAll(text: string, options?: any): Array<[string, number]>;
}
