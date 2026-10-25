/** Session-only credential gate. Cancellation never permits an old completion to own a new request. */
export type ShareConnection={url:string;token:string;scope:string};
export type ShareOperation={generation:number;connection:ShareConnection};
export class StatsShareSession {
 #connection:ShareConnection|null=null;
 #generation=0;
 #operation:ShareOperation|null=null;
 get busy(){return this.#operation!==null;}
 begin(scope:string,connection?:{url:string;token:string}):ShareOperation {
  if(this.#operation)throw Error('统计任务正在进行，请稍候');
  if(connection){this.#generation++;this.#connection={url:connection.url.trim(),token:connection.token.trim(),scope};}
  if(!this.#connection||this.#connection.scope!==scope)throw Error('请先连接当前账号的统计服务');
  const operation={generation:this.#generation,connection:this.#connection};this.#operation=operation;return operation;
 }
 current(operation:ShareOperation){return operation.generation===this.#generation&&operation.connection===this.#connection;}
 finish(operation:ShareOperation){if(this.#operation===operation)this.#operation=null;}
 disconnect(){this.#generation++;this.#connection=null;this.#operation=null;}
 switchScope(scope:string){if(this.#connection&&this.#connection.scope!==scope){this.disconnect();return true;}return false;}
}
