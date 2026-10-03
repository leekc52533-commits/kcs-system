export const noticeLanguages=['zh','ms','en']
export function noticeText(item,language){
 const version=item.translations?.[language]
 return {title:version?.title?.trim()||item.title,body:version?.body?.trim()||item.body}
}
