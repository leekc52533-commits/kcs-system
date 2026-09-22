export const systemReviewReasons=['customer','call','bill','full','bay','business_closed','stopped','other']
export const dualReviewReasons=['business_closed','stopped']
export const systemReviewSection=code=>['customer','call'].includes(code)?'schedule':code==='bill'?'pricing':code==='full'?'planner':'branch'
