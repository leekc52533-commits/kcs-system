import {MobileAppContent} from './AuthPages.jsx'
import {NoticeMobileProvider} from './NoticeBoard.jsx'

const testAccount={id:'TEST',employeeId:1,employeeName:'TEST DRIVER',role:'driver'}
// One shared router for all live and training menus, pages and future additions.
// API calls are handled only by the in-memory simulator installed by MobileSimulation.
export default function SimulationPhone({data,generation}){
 return <NoticeMobileProvider><MobileAppContent account={testAccount} simulationData={data} simulationGeneration={generation}/></NoticeMobileProvider>
}
