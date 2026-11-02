import {memberWorkspaceRequest} from './memberWorkspaceGateway.js';
export const saveClubMatchNumber=body=>memberWorkspaceRequest('clubTeamChat',{action:'setMatchNumber',...body});
