import {describe,it,expect} from 'vitest';
import {onboardingStep,onboardingNeedsKyc,kycRequired,isBoProfile,missingRequiredKyc,approvalUserPatch,type AccessRequest} from '../lib/vnext/onboarding';
describe('BO signup and payment exemption',()=>{
 const bo={role:'user',vnOnboarding:{status:'approved',dept:'bo'}};
 it('BO is one step, KD and unknown remain two steps',()=>{expect(onboardingNeedsKyc('bo')).toBe(false);expect(onboardingNeedsKyc('kd')).toBe(true);expect(onboardingNeedsKyc()).toBe(true)});
 it('BO pending skips KYC but still waits for approval',()=>{expect(onboardingStep({role:'user'},{status:'pending',kind:'onboarding',dept:'bo'},false)).toBe('pending');expect(onboardingStep({role:'user'},{status:'pending',kind:'onboarding',dept:'kd'},false)).toBe('kyc')});
 it('BO cancelled/rejected must register again',()=>{for(const status of ['cancelled','rejected'])expect(onboardingStep({role:'user'},{status,dept:'bo'},false)).toBe('register')});
 it('approved BO user/accountant has no payment nags; KD requirement unchanged',()=>{for(const role of ['user','accountant'])expect(kycRequired(role,{profile:{...bo,role}})).toBe(false);expect(kycRequired('user',{profile:{vnOnboarding:{dept:'kd'}}})).toBe(true);expect(kycRequired('user')).toBe(true)});
 it('BO excluded from missing counter/filter, aliases excluded too',()=>{expect(missingRequiredKyc(bo,null)).toBe(false);expect(missingRequiredKyc({role:'user'},null)).toBe(true);expect(missingRequiredKyc({linkedToUid:'canonical'},null)).toBe(false)});
 it('approval persists BO marker used after refresh; transfer to KD removes exemption',()=>{const req={dept:'bo',position:'bo_nhan_vien',boUnit:'digital',name:'Tên mẫu',kind:'onboarding'} as AccessRequest;expect(isBoProfile(approvalUserPatch(req,'user','adm','now'))).toBe(true);expect(isBoProfile(approvalUserPatch({...req,dept:'kd',position:'nvkd',teamId:'T'},'user','adm','now'))).toBe(false)});
});
