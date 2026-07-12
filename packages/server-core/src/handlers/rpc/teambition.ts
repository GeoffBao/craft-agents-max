/**
 * Teambition RPC handler stubs.
 *
 * Task 4 minimal implementation — wires the teambition-integration package
 * to the RPC layer. Task 5 renderer code depends on these channels.
 */
import type { IpcMainInvokeEvent } from 'electron'
import type {
  ClaimTeambitionTaskRequest,
  ClaimTeambitionTaskResponse,
  GetTeambitionBindingResponse,
  GetTeambitionCapabilitiesResponse,
  ListTeambitionTasksResponse,
} from '@craft-agent/shared/protocol/dto'

export async function handleListTeambitionTasks(
  _event: IpcMainInvokeEvent,
  _workspaceId: string,
): Promise<ListTeambitionTasksResponse> {
  // TODO: Wire to TeambitionGateway.listMyTasks() + loadBindings()
  return { tasks: [], capabilities: [] }
}

export async function handleClaimTeambitionTask(
  _event: IpcMainInvokeEvent,
  _workspaceId: string,
  _input: ClaimTeambitionTaskRequest,
): Promise<ClaimTeambitionTaskResponse> {
  // TODO: Wire to TeambitionGateway.getTaskBundle() + SessionManager.createSession()
  throw new Error('Teambition claim not yet wired — Task 4 pending')
}

export async function handleGetTeambitionBinding(
  _event: IpcMainInvokeEvent,
  _workspaceId: string,
  _taskId: string,
): Promise<GetTeambitionBindingResponse | null> {
  // TODO: Wire to findBindingByTaskId()
  return null
}

export async function handleGetTeambitionCapabilities(
  _event: IpcMainInvokeEvent,
  _workspaceId: string,
): Promise<GetTeambitionCapabilitiesResponse> {
  // TODO: Wire to TeambitionGateway.capabilities
  return { capabilities: [] }
}
