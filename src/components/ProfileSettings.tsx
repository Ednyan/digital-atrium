import { useState, useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { friendlyAuthError } from '../lib/authErrors'
import { supabase, isDesktop } from '../lib/supabase'
import { useGamePick } from '../store/gameStore'
import { deleteMyAccount, markFarewell, requestDeletionCode } from '../lib/account'
import { useTranslation } from '../lib/i18n'
import RichText from './RichText'
import {
  MAX_UNDO_DEPTH,
  readUndoDepth,
  writeUndoDepth,
  readPackingShape,
  writePackingShape,
} from '../lib/atriumPreferences'
import { goTo } from '../lib/route'
import { daysUntilNameChange, loadMyProfile, saveMyProfile } from '../lib/profile'
import { googleAccount, workerAccount } from '../lib/signedIn'
import { accountJoined, noteToday, readStats, syncStats, togglePinned } from '../lib/stats'
import { AchievementsGrid, ProfileTop } from './ProfileAchievements'
import { adopt, changePassword, deleteEmailAccount } from '../lib/emailAccount'
import GoogleButton from './GoogleButton'
import { LanguageList } from './LanguageToggle'
import { useMenuGlide } from './MenuGlide'

// The same five the in-atrium panel offers, from the palette the rest of the
// app is drawn in. The picker under them still takes anything.
const PRESET_COLORS = ['#FF8A3D', '#E8C15A', '#9AD4C4', '#A8B6D9', '#C77DFF']

interface ProfileSettingsProps {
  onClose: () => void
  // What's the screen behind's to do: none, where there's nothing of the kind.
  onPinterest?: () => void
  onLogOut?: () => void
}

// A setting, compact until it's pressed: its name, what it's set to, and under
// them what changes it, unfolding. `go`: it does something at once instead.
function SettingRow({ id, label, value, open = false, danger = false, go = false, onToggle, children }: {
  id: string
  label: string
  value?: string
  open?: boolean
  danger?: boolean
  go?: boolean
  onToggle: (id: string) => void
  children?: ReactNode
}) {
  return (
    <div data-setting={id} className="relative border-b last:border-b-0 border-nier-border/20">
      <button
        type="button"
        aria-expanded={go ? undefined : open}
        data-danger={danger || undefined}
        onClick={() => onToggle(id)}
        className={`profile-row relative w-full min-h-[2.9rem] px-3.5 flex items-center justify-between gap-3 text-left text-xs ${danger ? 'text-[#ff8585]' : 'text-nier-bg/95'}`}
      >
        <span>{label}</span>
        <span className="flex items-center gap-2 min-w-0 text-[11px] text-nier-bg/75">
          {value && <span className="truncate">{value}</span>}
          {!go && <span aria-hidden="true" className="profile-chevron" data-open={open || undefined}>▸</span>}
        </span>
      </button>
      {!go && (
        <div className="profile-fold" data-open={open || undefined}>
          <div className="min-h-0 overflow-hidden"><div className="px-3.5 pb-3.5 pt-1">{children}</div></div>
        </div>
      )}
    </div>
  )
}

export default function ProfileSettings({ onClose, onPinterest, onLogOut }: ProfileSettingsProps) {
  const { t, language, languages } = useTranslation()
  const { userId, username, setUsername, playerColor, setPlayerColor } = useGamePick('userId', 'username', 'setUsername', 'playerColor', 'setPlayerColor')
  // One's name, at the top of the page, where it's changed.
  const [savedName, setSavedName] = useState(username)
  // The one of the rows open: they're compact until pressed.
  const [openRow, setOpenRow] = useState<string | null>(null)
  const glide = useMenuGlide('.profile-row')
  const languageName = languages.find(entry => entry.code === language)?.endonym ?? ''
  // Going back: the page fades out first.
  const [leaving, setLeaving] = useState(false)
  const pageRef = useRef<HTMLDivElement>(null)
  const leave = () => {
    setLeaving(true)
    window.setTimeout(onClose, 170)
  }
  const leaveRef = useRef(leave)
  leaveRef.current = leave
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (e.key === 'Escape' && tag !== 'INPUT' && tag !== 'TEXTAREA') leaveRef.current()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  // One's achievements and how far one's come (lib/stats), and when one began: what the
  // account says, what the sign-in says, or the first day seen here. Nothing new
  // is asked for: one's entry is already read.
  const [stats, setStats] = useState(readStats)
  const [signedUp, setSignedUp] = useState<number | null>(null)
  useEffect(() => {
    let left = false
    noteToday()
    void syncStats().then(now => { if (!left) setStats(now) })
    void supabase?.auth.getUser().then(({ data }: any) => {
      const at = Date.parse(data?.user?.created_at ?? '')
      if (!left && Number.isFinite(at)) setSignedUp(at)
    })
    return () => { left = true }
  }, [])
  const joinedAt = [signedUp, accountJoined(), stats.firstDay ? Date.parse(stats.firstDay + 'T12:00:00') : null]
    .filter((at): at is number => typeof at === 'number' && Number.isFinite(at) && at > 0)
    .sort((a, b) => a - b)[0] ?? null
  const [actualUsername, setActualUsername] = useState('')
  const [canChange, setCanChange] = useState(isDesktop) // Desktop: always allowed
  const [daysUntilChange, setDaysUntilChange] = useState(0)
  const [error, setError] = useState('')
  
  // Password change state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  // Delete-account state -- web only, irreversible, so it's gated behind
  // typing the account's own username as an explicit confirmation.
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  // Confirmation is an emailed code now, for every account rather than only the
  // ones with a password -- see add_account_deletion_codes.sql. So there is no
  // longer anything to look up about how somebody signed in: the flow is the
  // same either way.
  const [deleteCode, setDeleteCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [codeSending, setCodeSending] = useState(false)
  // Seconds until another code may be asked for. The server enforces this; the
  // countdown only stops the button offering something that will be refused.
  const [resendIn, setResendIn] = useState(0)
  const [deleteLoading, setDeleteLoading] = useState(false)
  // A Google account (lib/signedIn) is deleted on Google's word, not a code --
  // and has no password to change. An email account (lib/emailAccount) is
  // deleted with its password, and changes it at the worker.
  const google = !!googleAccount()
  const emailAccount = workerAccount()?.kind === 'email'
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState('')

  // The three settings that follow the person rather than the atrium. They
  // live in localStorage, so they are readable before the profile row is.
  const [selectedColor, setSelectedColor] = useState(playerColor)
  const [colorSaved, setColorSaved] = useState(false)
  const [undoDepth, setUndoDepth] = useState(() => readUndoDepth())
  const [packingShape, setPackingShape] = useState(() => readPackingShape())

  // Whether the colour in use came from the picker rather than the five
  // presets, which decides whether the picker cell shows that colour or the
  // plus that invites you to choose one. Case-folded because an <input
  // type="color"> always reports lowercase hex while the presets are written
  // in upper -- comparing them raw would call every preset "custom".
  const isCustomColour = !PRESET_COLORS.some(
    c => c.toLowerCase() === selectedColor.toLowerCase(),
  )

  useEffect(() => {
    loadProfile()
  }, [])

  // Ticks the resend cooldown down to zero. Cleared on unmount so closing the
  // panel mid-countdown does not leave an interval running against a component
  // that is gone.
  useEffect(() => {
    if (resendIn <= 0) return
    const timer = setInterval(() => setResendIn(seconds => Math.max(0, seconds - 1)), 1000)
    return () => clearInterval(timer)
  }, [resendIn])

  // Either kind of account's (lib/profile).
  const loadProfile = async () => {
    if (!userId) return
    const profile = await loadMyProfile(userId).catch(() => null)
    if (!profile) return
    setActualUsername(profile.username)
    setSavedName(profile.displayName)
    if (profile.color) {
      setSelectedColor(profile.color)
      setPlayerColor(profile.color)
    }
    const days = daysUntilNameChange(profile.nameChangedAt)
    setCanChange(days === 0)
    setDaysUntilChange(days)
  }

  // Saved on click rather than with the name form: that form's button is
  // disabled while the name is unchanged, so a colour picked on its own could
  // never be submitted through it.
  const handleColorChange = async (color: string) => {
    setSelectedColor(color)
    setPlayerColor(color)
    setColorSaved(false)
    if (!userId) return
    try {
      await saveMyProfile(userId, { color })
    } catch (updateError: any) {
      setError(updateError?.message || t('profile.errCursorColour'))
      return
    }
    setColorSaved(true)
    setTimeout(() => setColorSaved(false), 1600)
  }

  // One row open at a time; what was half-typed in one goes as it closes.
  const toggleRow = (id: string) => {
    if (openRow === 'password' || id === 'password') {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordError('')
    }
    if (openRow === 'delete') {
      setDeleteConfirmText('')
      setDeleteCode('')
      setDeletePassword('')
      setCodeSent(false)
      setResendIn(0)
      setDeleteError('')
    }
    setOpenRow(now => (now === id ? null : id))
  }

  const handleUndoDepthChange = (value: number) => {
    const clamped = Math.max(1, Math.min(MAX_UNDO_DEPTH, value))
    setUndoDepth(clamped)
    writeUndoDepth(clamped)
    // An atrium open behind this screen picks it up without a reload.
    window.dispatchEvent(new CustomEvent('lobby-undo-depth-changed', { detail: clamped }))
  }

  const handlePackingShapeChange = (shape: 'square' | 'circle') => {
    setPackingShape(shape)
    writePackingShape(shape)
    window.dispatchEvent(new CustomEvent('lobby-packing-shape-changed', { detail: { lobbyId: null, shape } }))
  }

  // The name from the top of the page. What went wrong, to say there, or nothing.
  const saveName = async (next: string): Promise<string | null> => {
    if (!userId) return t('profile.errUpdateName')
    if (!isDesktop && !canChange) return t('profile.canChangeIn', { days: daysUntilChange })
    if (next.length < 1 || next.length > 30) return t('profile.errNameLength')
    try {
      // The web's waits its days; the desktop's is its username too (lib/profile).
      await saveMyProfile(userId, { displayName: next })
      setUsername(next)
      setSavedName(next)
      if (!isDesktop) {
        setCanChange(false)
        setDaysUntilChange(15)
      }
      return null
    } catch (err: any) {
      return err?.message === 'NAME_TOO_SOON'
        ? t('profile.canChangeIn', { days: daysUntilNameChange(null, err.until) })
        : err?.message || t('profile.errUpdateName')
    }
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess(false)
    setPasswordLoading(true)

    if (!supabase) {
      setPasswordError(t('auth.errUnavailable'))
      setPasswordLoading(false)
      return
    }

    if (newPassword.length < 6) {
      setPasswordError(t('profile.errPasswordLength'))
      setPasswordLoading(false)
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordError(t('auth.passwordsDoNotMatch'))
      setPasswordLoading(false)
      return
    }

    if (!currentPassword) {
      setPasswordError(t('profile.errEnterCurrent'))
      setPasswordLoading(false)
      return
    }

    // An email account: the worker checks the current one and sets the new
    // (lib/emailAccount); every other sign-in of it ends.
    if (emailAccount) {
      try {
        if (currentPassword === newPassword) throw new Error('SAME')
        await changePassword(currentPassword, newPassword)
        setPasswordSuccess(true)
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        setTimeout(() => { setOpenRow(null); setPasswordSuccess(false) }, 2000)
      } catch (err: any) {
        setPasswordError(err?.message === 'WRONG_PASSWORD' ? t('profile.errWrongCurrent') : err?.message === 'SAME' ? t('profile.errSamePassword') : err?.message === 'WEAK_PASSWORD' ? t('auth.passwordHint') : t('profile.errUpdatePassword'))
      } finally {
        setPasswordLoading(false)
      }
      return
    }

    try {
      // Prove it is the account holder at the keyboard before changing the
      // password. A session left open on a shared machine is enough to change
      // it otherwise, which locks the real owner out of their own account.
      // Supabase has no verify-password call, so the check is a sign-in with
      // the same credentials: it fails harmlessly on a wrong password and
      // leaves the existing session alone.
      const { data: userData } = await supabase.auth.getUser()
      const email = userData?.user?.email
      if (!email) throw new Error('Could not confirm which account this is')

      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      })
      if (reauthError) {
        setPasswordError(t('profile.errWrongCurrent'))
        setPasswordLoading(false)
        return
      }

      if (currentPassword === newPassword) {
        setPasswordError(t('profile.errSamePassword'))
        setPasswordLoading(false)
        return
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      })

      if (updateError) throw updateError

      // The worker's copy of it too (lib/emailAccount), with the sign-in just made.
      const { data: { session: fresh } } = await supabase.auth.getSession()
      if (fresh && actualUsername) void adopt(fresh.access_token, email, actualUsername, newPassword)

      setPasswordSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      
      setTimeout(() => {
        setOpenRow(null)
        setPasswordSuccess(false)
      }, 2000)
    } catch (err: any) {
      setPasswordError(friendlyAuthError(err, t('profile.errUpdatePassword')))
    } finally {
      setPasswordLoading(false)
    }
  }

  const handleSendDeletionCode = async () => {
    // Guarded on the username as well, so the first thing this flow does is
    // never to email somebody about deleting an account because a stranger
    // opened the panel and pressed a button.
    if (!actualUsername || deleteConfirmText !== actualUsername) return
    setDeleteError('')
    setCodeSending(true)

    const result = await requestDeletionCode()
    setCodeSending(false)

    if (!result.success) {
      if (result.code === 'too_soon') {
        // Not an error worth a red box: a code is already in their inbox.
        setCodeSent(true)
        setResendIn(result.retryAfter ?? 60)
        return
      }
      setDeleteError(
        result.code === 'email_not_configured' || result.code === 'send_failed'
          ? t('profile.errCodeNotSent')
          : result.error || t('profile.errCodeNotSent'),
      )
      return
    }

    setCodeSent(true)
    setResendIn(60)
  }

  const handleDeleteAccount = async () => {
    // actualUsername is empty until the profile row loads, and an empty
    // confirmation box matches an empty expected name -- which would turn
    // "type your username" into "type nothing" on the one action in this
    // panel that cannot be undone. Loading has to have happened first.
    if (!actualUsername || deleteConfirmText !== actualUsername) return
    setDeleteError('')

    if (!deleteCode) {
      setDeleteError(t('profile.errEnterCode'))
      return
    }

    setDeleteLoading(true)

    // The code goes to the Edge Function and is checked there, rather than
    // being checked here first. Verifying in the browser would only ever be a
    // gate in front of the request -- the endpoint would still delete on a
    // valid session alone, so anything that skipped this panel skipped the
    // check with it. One check, on the side that cannot be bypassed.
    const result = await deleteMyAccount(deleteCode)

    if (!result.success) {
      setDeleteError(
        result.code === 'invalid_code'
          ? t('profile.errWrongCode')
          : result.code === 'code_expired'
            ? t('profile.errCodeExpired')
            : result.code === 'code_required'
              ? t('profile.errEnterCode')
              : result.error || t('profile.errDeleteAccount'),
      )
      // An expired or spent code cannot be retyped into working, so the panel
      // goes back to offering a new one instead of leaving a dead box.
      if (result.code === 'code_expired') {
        setCodeSent(false)
        setDeleteCode('')
        setResendIn(0)
      }
      setDeleteLoading(false)
      return
    }

    leaveAfterDeletion()
  }

  // An email account's: its password, once more -- the worker checks it, and
  // this browser is signed out as it goes (lib/emailAccount).
  const handleDeleteEmailAccount = async () => {
    if (!actualUsername || deleteConfirmText !== actualUsername || !deletePassword) return
    setDeleteError('')
    setDeleteLoading(true)
    try {
      await deleteEmailAccount(deletePassword)
    } catch (err: any) {
      setDeleteError(err?.message === 'WRONG_PASSWORD' ? t('profile.errWrongCurrent') : t('profile.errDeleteAccount'))
      setDeleteLoading(false)
      return
    }
    leaveAfterDeletion()
  }

  // A Google account's: confirmed by a sign-in with its Google just now (the
  // button below), which the worker checks -- no code to email. It signs this
  // browser out as it goes (lib/drive).
  const handleDeleteGoogleAccount = async (idToken: string) => {
    if (!actualUsername || deleteConfirmText !== actualUsername) return
    setDeleteError('')
    setDeleteLoading(true)
    try {
      await (await import('../lib/drive')).deleteGoogleAccount(idToken)
    } catch (err: any) {
      setDeleteError(err?.message === 'OTHER_GOOGLE' ? t('profile.errOtherGoogle') : err?.message || t('profile.errDeleteAccount'))
      setDeleteLoading(false)
      return
    }
    leaveAfterDeletion()
  }

  // Gone: what this browser kept of where one was, and on to the start --
  // where it's said, with thanks (App's FarewellNotice).
  const leaveAfterDeletion = () => {
    markFarewell()
    localStorage.removeItem('lobby_hasEntered')
    localStorage.removeItem('lobby_currentLobbyId')
    localStorage.removeItem('lobby_showBrowser')
    goTo('/')
    window.location.reload()
  }

  return (
    <div
      ref={pageRef}
      data-profile=""
      data-leaving={leaving || undefined}
      className="profile-page fixed inset-0 bg-nier-black z-[10000] overflow-y-auto"
      style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      // Clicking beside something deliberately does nothing: this holds
      // half-typed passwords and a delete-account confirmation, and a stray
      // click should not throw that away. The stop is explicit rather than merely
      // omitted so that no ancestor added later can quietly make it a dismissal.
      onClick={(e) => e.stopPropagation()}
    >
      <div aria-hidden="true" className="profile-glow" />
      {/* A page of its own: who one is and one's achievements, one's settings beside them. */}
      <div className="relative max-w-[82rem] mx-auto px-5 sm:px-10 xl:px-16 py-7">
        <div className="enter-down flex items-center justify-between gap-4 mb-8">
          <button
            type="button"
            data-profile-back=""
            onClick={leave}
            className="profile-back text-[11px] tracking-[0.2em] uppercase text-nier-bg/80 hover:text-nier-strong transition-colors"
          >
            <span aria-hidden="true" className="inline-block transition-transform">◁</span> {t('common.back')}
          </button>
          <span className="text-[11px] tracking-wide text-nier-bg/70">{t('achievements.private')}</span>
        </div>
        <ProfileTop
          name={savedName}
          username={isDesktop ? '' : actualUsername}
          colour={selectedColor}
          joined={joinedAt}
          stats={stats}
          canEdit={isDesktop || canChange}
          locked={!isDesktop && !canChange ? t('profile.canChangeIn', { days: daysUntilChange }) : null}
          every={isDesktop ? null : t('profile.nameEvery')}
          onSaveName={saveName}
        />
        <div className="mt-9 grid gap-9 lg:grid-cols-[minmax(0,1fr)_23.25rem] items-start">
          <AchievementsGrid stats={stats} onToggle={id => setStats(togglePinned(id))} />
          <aside data-profile-settings="" aria-labelledby="profile-settings-title" className="enter-up" style={{ '--i': 3 } as CSSProperties}>
            <h2 id="profile-settings-title" className="text-xs font-medium tracking-[0.24em] uppercase text-nier-strong">{t('profile.yours')}</h2>
            <div {...glide.host} className="menu-glide-host relative mt-3.5 border border-nier-border/30">
              {glide.light}
              <div data-setting="colour" className="relative p-3.5 border-b border-nier-border/20">
                <p className="text-[10px] tracking-[0.16em] uppercase text-nier-bg/75">
                  {t('profile.yourCursor')}
                  {colorSaved && <span className="profile-note ml-2 normal-case tracking-normal text-nier-bg/80">{t('profile.saved')}</span>}
                </p>
                <div className="grid grid-cols-6 gap-2 mt-2.5">
                  {/* First, as "anything else": the colour one chose oneself. The
                      native input stretched over it at no opacity stays the real
                      target; the dashed cell with a plus says it opens a picker. */}
                  <div
                    className={`group relative h-8 border border-dashed transition-colors cursor-pointer ${isCustomColour ? 'border-nier-bg' : 'border-nier-border/50 hover:border-nier-border/80'}`}
                    style={{ backgroundColor: isCustomColour ? selectedColor : 'transparent' }}
                  >
                    <input
                      type="color"
                      value={selectedColor}
                      onChange={(e) => handleColorChange(e.target.value)}
                      title={t('profile.anyOtherColour')}
                      aria-label={t('profile.anyOtherColour')}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    {!isCustomColour && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm leading-none text-nier-bg/70 group-hover:text-nier-bg transition-colors">+</span>}
                  </div>
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={color}
                      aria-pressed={selectedColor === color}
                      onClick={() => handleColorChange(color)}
                      className={`profile-swatch h-8 border-2 ${selectedColor === color ? 'border-nier-strong' : 'border-transparent'}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                {error && <p className="profile-note mt-2 text-xs text-[#ff8585]">{error}</p>}
              </div>

              <SettingRow id="undo" label={t('profile.undoLabel')} value={String(undoDepth)} open={openRow === 'undo'} onToggle={toggleRow}>
                <input
                  type="range"
                  min="1"
                  max={MAX_UNDO_DEPTH}
                  step="1"
                  value={undoDepth}
                  aria-label={t('profile.undoLabel')}
                  onChange={(e) => handleUndoDepthChange(parseInt(e.target.value, 10))}
                  className="w-full accent-nier-bg"
                />
                <p className="text-nier-bg/70 text-xs leading-relaxed mt-1.5">{t('profile.undoNote')}</p>
              </SettingRow>

              <SettingRow id="shape" label={t('profile.batchShape')} value={packingShape === 'square' ? t('profile.shapeSquare') : t('profile.shapeCircle')} open={openRow === 'shape'} onToggle={toggleRow}>
                <div className="flex gap-2">
                  {(['square', 'circle'] as const).map(shape => (
                    <button
                      key={shape}
                      type="button"
                      aria-pressed={packingShape === shape}
                      onClick={() => handlePackingShapeChange(shape)}
                      className={`flex-1 py-2 border text-xs tracking-[0.15em] uppercase transition-colors ${packingShape === shape ? 'border-nier-bg bg-nier-bg/10 text-nier-bg' : 'border-nier-border/40 text-nier-bg/80 hover:border-nier-border/60'}`}
                    >
                      {shape === 'square' ? t('profile.shapeSquare') : t('profile.shapeCircle')}
                    </button>
                  ))}
                </div>
                <p className="text-nier-bg/70 text-xs leading-relaxed mt-2">{t('profile.batchNote')}</p>
              </SettingRow>

              <SettingRow id="language" label={t('welcome.language')} value={languageName} open={openRow === 'language'} onToggle={toggleRow}>
                <div className="-mx-3.5 -mb-3.5"><LanguageList onChosen={() => setOpenRow(null)} /></div>
              </SettingRow>

              {onPinterest && <SettingRow id="pinterest" label={t('profile.pinterest')} onToggle={onPinterest} go />}

              {!isDesktop && !google && (
                <SettingRow id="password" label={t('profile.changePassword')} open={openRow === 'password'} onToggle={toggleRow}>
                  <form onSubmit={handlePasswordChange} className="space-y-3">
                    <div>
                      <label className="block text-nier-strong text-xs tracking-[0.1em] uppercase mb-1">{t('profile.currentPassword')}</label>
                      <input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full bg-nier-black border border-nier-border/30 text-nier-bg px-3 py-2 text-sm tracking-wide placeholder-nier-bg/50 focus:border-nier-border/60 transition-colors"
                        placeholder="••••••••"
                        autoComplete="current-password"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-nier-strong text-xs tracking-[0.1em] uppercase mb-1">{t('profile.newPassword')}</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full bg-nier-black border border-nier-border/30 text-nier-bg px-3 py-2 text-sm tracking-wide placeholder-nier-bg/50 focus:border-nier-border/60 transition-colors"
                        placeholder="••••••••"
                        minLength={6}
                        required
                      />
                    </div>
                    
                    <div>
                      <label className="block text-nier-strong text-xs tracking-[0.1em] uppercase mb-1">{t('profile.confirmNewPassword')}</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full bg-nier-black border border-nier-border/30 text-nier-bg px-3 py-2 text-sm tracking-wide placeholder-nier-bg/50 focus:border-nier-border/60 transition-colors"
                        placeholder="••••••••"
                        minLength={6}
                        required
                      />
                    </div>

                    {passwordError && (
                      <div className="border border-nier-red/40 bg-nier-red/10 px-3 py-2 text-nier-bg/80 text-[0.8rem] leading-relaxed tracking-wide">
                        {passwordError}
                      </div>
                    )}

                    {passwordSuccess && (
                      <div className="border border-nier-border/40 bg-nier-border/10 px-3 py-2 text-nier-bg text-[0.8rem] leading-relaxed tracking-wide">
                        ✓ {t('profile.passwordUpdated')}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={passwordLoading || !currentPassword || !newPassword || !confirmPassword}
                      className="w-full py-2 bg-nier-bg text-nier-black text-xs tracking-[0.1em] uppercase hover:bg-nier-strong transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {passwordLoading ? t('profile.updating') : t('profile.updatePassword')}
                    </button>
                  </form>
                </SettingRow>
              )}

              {!isDesktop && (
                <SettingRow id="delete" label={t('profile.deleteAccount')} danger open={openRow === 'delete'} onToggle={toggleRow}>
                  <div className="border border-nier-red/60 bg-nier-red/10 p-3 space-y-3">
                  <p className="text-nier-bg text-[0.8rem] leading-relaxed tracking-wide">
                    {t('profile.deleteWarning')}
                  </p>
                  {/* This line was hardcoded English -- "Type X to confirm"
                      spliced around a <span> -- while two catalogue keys for
                      it sat unused. It is one key now, with the name inside
                      the sentence, because the name lands in a different
                      place in every language. RichText renders that run in
                      the username's real case so it can be copied exactly,
                      which is the whole reason it was a span to begin with. */}
                  <p className="text-nier-bg/75 text-xs tracking-[0.1em] uppercase">
                    <RichText
                      text={t('profile.deleteTypeToConfirm', { name: actualUsername })}
                      className="text-nier-bg normal-case"
                    />
                  </p>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    className="w-full bg-nier-black border border-nier-red/40 text-nier-bg px-3 py-2 text-sm tracking-wide placeholder-nier-bg/50 focus:border-nier-red/60 transition-colors"
                    placeholder={actualUsername}
                    autoComplete="off"
                  />

                  {/* And a code emailed to the account, on top of it. Typing a
                      username printed on the screen directly above the box is a
                      guard against misclicking, not against a stranger at an
                      unlocked machine -- the code is what tells those two
                      apart, and unlike the password it replaced, every account
                      has one. */}
                  {google ? (
                    // A Google account confirms with Google, once its name is typed.
                    actualUsername && deleteConfirmText === actualUsername && (
                      <div className="space-y-2">
                        <p className="text-nier-bg/70 text-[0.75rem] leading-relaxed tracking-wide normal-case">{t('profile.deleteWithGoogle')}</p>
                        <GoogleButton busy={deleteLoading} hint={googleAccount()?.email ?? undefined} onCredential={idToken => void handleDeleteGoogleAccount(idToken)} />
                      </div>
                    )
                  ) : emailAccount ? (
                    // An email account confirms with its password, once its name is typed.
                    actualUsername && deleteConfirmText === actualUsername && (
                      <div>
                        <label htmlFor="delete-account-password" className="block text-nier-bg/75 text-xs tracking-[0.1em] uppercase mb-2">
                          {t('profile.deleteWithPassword')}
                        </label>
                        <input
                          id="delete-account-password"
                          type="password"
                          value={deletePassword}
                          onChange={(e) => setDeletePassword(e.target.value)}
                          className="w-full bg-nier-black border border-nier-red/40 text-nier-bg px-3 py-2 text-sm tracking-wide placeholder-nier-bg/50 focus:border-nier-red/60 transition-colors"
                          autoComplete="current-password"
                        />
                      </div>
                    )
                  ) : !codeSent ? (
                    <button
                      onClick={handleSendDeletionCode}
                      disabled={codeSending || !actualUsername || deleteConfirmText !== actualUsername}
                      className="w-full py-2 border border-nier-red/60 text-nier-red text-xs tracking-[0.1em] uppercase hover:bg-nier-red/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {codeSending ? t('profile.sendingCode') : t('profile.sendCode')}
                    </button>
                  ) : (
                    <div>
                      <label
                        htmlFor="delete-account-code"
                        className="block text-nier-bg/75 text-xs tracking-[0.1em] uppercase mb-2"
                      >
                        {t('profile.deleteCode')}
                      </label>
                      <p className="text-nier-bg/60 text-[0.75rem] leading-relaxed tracking-wide mb-2 normal-case">
                        {t('profile.deleteCodeSent')}
                      </p>
                      <input
                        id="delete-account-code"
                        type="text"
                        inputMode="numeric"
                        // Six digits, so anything longer is a paste of
                        // something else and anything non-numeric is a typo.
                        // Filtered rather than validated, because a box that
                        // silently refuses the wrong character is quicker to
                        // understand than one that complains afterwards.
                        value={deleteCode}
                        onChange={(e) => setDeleteCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="w-full bg-nier-black border border-nier-red/40 text-nier-bg px-3 py-2 text-sm tracking-[0.4em] placeholder-nier-bg/50 focus:border-nier-red/60 transition-colors"
                        placeholder="000000"
                        autoComplete="one-time-code"
                      />
                      <button
                        onClick={handleSendDeletionCode}
                        disabled={codeSending || resendIn > 0}
                        className="mt-2 text-nier-bg/60 text-[0.75rem] tracking-wide underline hover:text-nier-bg transition-colors disabled:no-underline disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {resendIn > 0 ? t('profile.resendCodeIn', { seconds: String(resendIn) }) : t('profile.resendCode')}
                      </button>
                    </div>
                  )}

                  {deleteError && (
                    <div className="border border-nier-red/40 bg-nier-red/10 px-3 py-2 text-nier-bg/80 text-[0.8rem] leading-relaxed tracking-wide">
                      {deleteError}
                    </div>
                  )}

                  <div className="flex gap-2">
                    {!google && <button
                      onClick={emailAccount ? handleDeleteEmailAccount : handleDeleteAccount}
                      disabled={deleteLoading || !actualUsername || deleteConfirmText !== actualUsername || (emailAccount ? !deletePassword : !codeSent || deleteCode.length < 6)}
                      className="flex-1 py-2 bg-nier-red/80 text-nier-black text-xs tracking-[0.1em] uppercase hover:bg-nier-red transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {deleteLoading ? t('profile.deleting') : t('profile.deletePermanently')}
                    </button>}
                    <button
                      onClick={() => setOpenRow(null)}
                      disabled={deleteLoading}
                      className="flex-1 py-2 border border-nier-border/30 text-nier-bg/80 text-xs tracking-[0.1em] uppercase hover:border-nier-border/60 hover:text-nier-bg transition-colors disabled:opacity-30"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>

                </SettingRow>
              )}

              {onLogOut && <SettingRow id="logout" label={t('welcome.logOut')} danger onToggle={onLogOut} go />}
            </div>
            {!isDesktop && (
              <p className="mt-3.5 text-[11px] leading-relaxed text-nier-bg/70">
                <a href="/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-nier-bg transition-colors">{t('landing.privacy')}</a>
                <span aria-hidden="true"> · </span>
                <a href="/terms" target="_blank" rel="noopener noreferrer" className="hover:text-nier-bg transition-colors">{t('landing.terms')}</a>
              </p>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}
