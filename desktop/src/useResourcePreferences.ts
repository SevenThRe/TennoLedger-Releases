import {useState} from 'react';
import {parseResourcePreferences,resourceDefaults,type ResourcePreferences} from './resourcePreferences';
export function useResourcePreferences(key='tennoledger.resources.preferences.v1'){
 const [initial]=useState(()=>{try{return {value:parseResourcePreferences(localStorage.getItem(key)),error:false};}catch{return {value:{...resourceDefaults},error:true};}});
 const [preferences,setPreferences]=useState(initial.value),[storageError,setStorageError]=useState(initial.error);
 const update=(patch:Partial<ResourcePreferences>)=>{
  const next={...preferences,...patch};setPreferences(next);
  try{localStorage.setItem(key,JSON.stringify(next));setStorageError(false);}catch{setStorageError(true);}
 };
 return {preferences,update,storageError};
}
