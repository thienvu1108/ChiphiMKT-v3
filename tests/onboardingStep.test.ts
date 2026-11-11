import { describe, it, expect } from 'vitest';
import { onboardingStep } from '../lib/vnext/onboarding';
const u = { role: 'user' };
describe('onboardingStep', () => {
  it('chưa gửi → register', () => { expect(onboardingStep(u, null, false)).toBe('register'); expect(onboardingStep(u, { status: 'cancelled', kind: 'onboarding' }, true)).toBe('register'); expect(onboardingStep(u, { status: 'rejected', kind: 'onboarding' }, true)).toBe('register'); });
  it('đã gửi, chưa KYC → kyc', () => expect(onboardingStep(u, { status: 'pending', kind: 'onboarding' }, false)).toBe('kyc'));
  it('đã gửi + KYC → pending', () => expect(onboardingStep(u, { status: 'pending', kind: 'onboarding' }, true)).toBe('pending'));
  it('đã duyệt / Admin / owner → null', () => {
    expect(onboardingStep({ role: 'user', vnOnboarding: { status: 'approved' } }, null, false)).toBeNull();
    expect(onboardingStep({ role: 'admin' }, null, false)).toBeNull();
    expect(onboardingStep(u, null, false, { isAppOwner: true })).toBeNull();
  });
});
