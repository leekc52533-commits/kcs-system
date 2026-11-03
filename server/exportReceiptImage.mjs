import {readFile} from 'node:fs/promises'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
const execute=promisify(execFile)
// Resize an export copy only. Original evidence is never overwritten.
export async function exportReceiptImage(absolute,extension,{convert=process.env.KCS_CONVERT_PATH||'convert'}={}){
 const original=await readFile(absolute)
 if(original.length<180000)return{buffer:original,extension,originalBytes:original.length,fallback:false}
 try{
  const {stdout}=await execute(convert,['-limit','memory','64MiB','-limit','map','128MiB',absolute+'[0]','-auto-orient','-resize','1600x1600>','-background','white','-alpha','remove','-strip','-quality','85','jpeg:-'],{encoding:'buffer',timeout:5000,maxBuffer:12*1024*1024})
  if(stdout.length&&stdout.length<original.length)return{buffer:stdout,extension:'jpeg',originalBytes:original.length,fallback:false}
  return{buffer:original,extension,originalBytes:original.length,fallback:false}
 }catch{
  // Preserve evidence when ImageMagick is unavailable or a photo cannot be converted.
  return{buffer:original,extension,originalBytes:original.length,fallback:true}
 }
}
