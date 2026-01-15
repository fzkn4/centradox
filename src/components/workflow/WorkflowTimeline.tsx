'use client'

import { getStatusColor, getStatusLabel } from '@/lib/permissions'
import { format } from 'date-fns'

interface WorkflowStep {
  id: string
  stepOrder: number
  departmentId: string | null
  role: string
  status: string
  completedAt: string | null
  comment: string | null
  department: {
    id: string
    name: string
  } | null
  assignedTo: {
    id: string
    name: string
  } | null
}

interface WorkflowTimelineProps {
  steps: WorkflowStep[]
  currentStep: number
  userDepartmentStep?: {
    stepOrder: number
    departmentName: string
    requiredRole: string
    stepStatus: string
    isCurrentStep: boolean
  } | null
}

export function WorkflowTimeline({ steps, currentStep, userDepartmentStep }: WorkflowTimelineProps) {
  const getStatus = (step: WorkflowStep) => {
    if (step.stepOrder < currentStep) return 'completed'
    if (step.stepOrder === currentStep) return 'current'
    return 'pending'
  }

  const getStepStyle = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500 border-green-500 text-white'
      case 'current':
        return 'bg-indigo-600 border-indigo-600 text-white'
      case 'pending':
        return 'bg-gray-200 border-gray-300 text-gray-500'
      default:
        return 'bg-gray-200 border-gray-300 text-gray-500'
    }
  }

  const getLineStyle = (status: string, index: number, isLast: boolean) => {
    if (isLast) return 'hidden'
    return status === 'completed' ? 'bg-green-400' : 'bg-gray-300'
  }

  const isUserDepartmentStep = (step: WorkflowStep) => {
    return userDepartmentStep && userDepartmentStep.stepOrder === step.stepOrder
  }

  return (
    <div className="relative">
      <div className="flex items-center justify-between relative">
        {steps.map((step, index) => {
          const status = getStatus(step)
          const isLast = index === steps.length - 1
          const isUserDept = isUserDepartmentStep(step)

          return (
            <div key={step.id} className="flex-1 flex flex-col items-center relative">
              <div className="w-full absolute top-4 left-1/2 transform -translate-x-1/2 h-1 -z-10">
                <div className={`h-1 transition-all duration-300 ${getLineStyle(status, index, isLast)}`} />
              </div>

              <div
                className={`w-8 h-8 rounded-full border-4 flex items-center justify-center font-semibold text-xs transition-all duration-300 ${getStepStyle(status)} ${isUserDept ? 'ring-4 ring-indigo-200 ring-offset-2' : ''}`}
              >
                {step.stepOrder}
              </div>

              <div className="mt-2 text-center max-w-[120px]">
                <p className="text-xs font-medium text-gray-900 truncate" title={step.department?.name}>
                  {step.department?.name || 'No Department'}
                </p>
                <p className="text-xs text-gray-500 capitalize">{step.role.toLowerCase()}</p>
                {isUserDept && (
                  <span className="inline-block mt-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-700">
                    Your Step
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function WorkflowTimelineVertical({ steps, currentStep, userDepartmentStep }: WorkflowTimelineProps) {
  const getStatus = (step: WorkflowStep) => {
    if (step.stepOrder < currentStep) return 'completed'
    if (step.stepOrder === currentStep) return 'current'
    return 'pending'
  }

  const getStepStyle = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500 text-white border-green-500'
      case 'current':
        return 'bg-indigo-600 text-white border-indigo-600'
      case 'pending':
        return 'bg-white text-gray-400 border-gray-300'
      default:
        return 'bg-white text-gray-400 border-gray-300'
    }
  }

  const isUserDepartmentStep = (step: WorkflowStep) => {
    return userDepartmentStep && userDepartmentStep.stepOrder === step.stepOrder
  }

  return (
    <div className="space-y-4">
      {steps.map((step, index) => {
        const status = getStatus(step)
        const isUserDept = isUserDepartmentStep(step)

        return (
          <div key={step.id} className="flex items-start space-x-4">
            <div className={`flex-shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center font-semibold text-sm transition-all duration-300 ${getStepStyle(status)} ${isUserDept ? 'ring-2 ring-indigo-400' : ''}`}>
              {step.stepOrder}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <p className="text-sm font-semibold text-gray-900">
                  {step.department?.name || 'No Department'}
                </p>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(step.status)}`}>
                  {getStatusLabel(step.status)}
                </span>
                {isUserDept && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700">
                    Your Step
                  </span>
                )}
              </div>
              <div className="mt-1 flex items-center space-x-4 text-xs text-gray-500">
                <span className="capitalize">{step.role.toLowerCase()}</span>
                {step.assignedTo ? (
                  <span>Assigned to: {step.assignedTo.name}</span>
                ) : (
                  <span>All {step.role.toLowerCase()}s in {step.department?.name || 'General'}</span>
                )}
                {step.completedAt && (
                  <span>Completed: {format(new Date(step.completedAt), 'MMM dd, yyyy')}</span>
                )}
              </div>
              {step.comment && (
                <p className="mt-2 text-sm text-gray-600 italic">
                  "{step.comment}"
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
