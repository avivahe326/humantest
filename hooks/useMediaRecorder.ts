'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

export type RecorderStatus =
  | 'idle'
  | 'requesting'
  | 'recording'
  | 'stopping'
  | 'completed'
  | 'uploading'
  | 'done'

export type RecorderError =
  | 'permission-denied'
  | 'no-device'
  | 'upload-failed'
  | null

interface UseMediaRecorderOptions {
  maxDurationMs?: number
}

interface UseMediaRecorderReturn {
  status: RecorderStatus
  duration: number
  uploadProgress: number
  error: RecorderError
  screenRecUrl: string | null
  audioUrl: string | null
  startRecording: () => Promise<boolean>
  stopRecording: () => void
  uploadRecordings: (taskId: string, claimId: string) => Promise<{ screenRecUrl: string; audioUrl: string }>
  recoverAndUpload: (taskId: string, claimId: string) => Promise<boolean>
}

function getSupportedVideoMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ]
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime
  }
  return 'video/webm'
}

function getSupportedAudioMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
  ]
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime
  }
  return 'audio/webm'
}

function xhrUpload(
  url: string,
  blob: Blob,
  contentType: string,
  onProgress: (loaded: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url, true)
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded, e.total)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`Upload failed: ${xhr.status}`))
    }
    xhr.onerror = () => reject(new Error('Upload network error'))
    xhr.send(blob)
  })
}

// IndexedDB helpers for persisting recording chunks
const DB_NAME = 'recording-chunks'
const DB_VERSION = 1

function openChunkDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('screen')) db.createObjectStore('screen', { autoIncrement: true })
      if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio', { autoIncrement: true })
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function saveChunk(storeName: 'screen' | 'audio', chunk: Blob): Promise<void> {
  const db = await openChunkDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    tx.objectStore(storeName).add(chunk)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

async function saveMeta(taskId: string): Promise<void> {
  const db = await openChunkDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readwrite')
    tx.objectStore('meta').put(taskId, 'taskId')
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

async function loadChunks(storeName: 'screen' | 'audio'): Promise<Blob[]> {
  const db = await openChunkDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const req = tx.objectStore(storeName).getAll()
    req.onsuccess = () => { db.close(); resolve(req.result as Blob[]) }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

async function loadMeta(): Promise<string | null> {
  try {
    const db = await openChunkDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('meta', 'readonly')
      const req = tx.objectStore('meta').get('taskId')
      req.onsuccess = () => { db.close(); resolve(req.result as string | null) }
      req.onerror = () => { db.close(); reject(req.error) }
    })
  } catch {
    return null
  }
}

async function clearChunkDB(): Promise<void> {
  try {
    const db = await openChunkDB()
    const tx = db.transaction(['screen', 'audio', 'meta'], 'readwrite')
    tx.objectStore('screen').clear()
    tx.objectStore('audio').clear()
    tx.objectStore('meta').clear()
    return new Promise((resolve) => {
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => { db.close(); resolve() }
    })
  } catch {}
}

export function useMediaRecorder({
  maxDurationMs = 15 * 60 * 1000,
}: UseMediaRecorderOptions): UseMediaRecorderReturn {
  const [status, setStatus] = useState<RecorderStatus>('idle')
  const [duration, setDuration] = useState(0)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<RecorderError>(null)
  const [screenRecUrl, setScreenRecUrl] = useState<string | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)

  const screenRecorderRef = useRef<MediaRecorder | null>(null)
  const audioRecorderRef = useRef<MediaRecorder | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const audioStreamRef = useRef<MediaStream | null>(null)
  const screenChunksRef = useRef<Blob[]>([])
  const audioChunksRef = useRef<Blob[]>([])
  const screenBlobRef = useRef<Blob | null>(null)
  const audioBlobRef = useRef<Blob | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)
  const mountedRef = useRef(true)
  const lockReleaseRef = useRef<(() => void) | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      screenStreamRef.current?.getTracks().forEach(t => t.stop())
      audioStreamRef.current?.getTracks().forEach(t => t.stop())
      if (timerRef.current) clearInterval(timerRef.current)
      try { screenRecorderRef.current?.stop() } catch {}
      try { audioRecorderRef.current?.stop() } catch {}
      if (lockReleaseRef.current) {
        lockReleaseRef.current()
        lockReleaseRef.current = null
      }
    }
  }, [])

  const stopAllTracks = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach(t => t.stop())
    audioStreamRef.current?.getTracks().forEach(t => t.stop())
    screenStreamRef.current = null
    audioStreamRef.current = null
  }, [])

  const stopRecording = useCallback(() => {
    if (screenRecorderRef.current?.state !== 'recording' && audioRecorderRef.current?.state !== 'recording') {
      return
    }

    setStatus('stopping')
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    const screenDone = new Promise<void>((resolve) => {
      const sr = screenRecorderRef.current
      if (!sr || sr.state !== 'recording') { resolve(); return }
      sr.onstop = () => {
        screenBlobRef.current = new Blob(screenChunksRef.current, { type: 'video/webm' })
        screenChunksRef.current = []
        resolve()
      }
      sr.stop()
    })

    const audioDone = new Promise<void>((resolve) => {
      const ar = audioRecorderRef.current
      if (!ar || ar.state !== 'recording') { resolve(); return }
      ar.onstop = () => {
        audioBlobRef.current = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        audioChunksRef.current = []
        resolve()
      }
      ar.stop()
    })

    Promise.all([screenDone, audioDone]).then(() => {
      stopAllTracks()
      if (lockReleaseRef.current) {
        lockReleaseRef.current()
        lockReleaseRef.current = null
      }
      if (mountedRef.current) setStatus('completed')
    })
  }, [stopAllTracks])

  const startRecording = useCallback(async (): Promise<boolean> => {
    setStatus('requesting')
    setError(null)
    setDuration(0)
    screenChunksRef.current = []
    audioChunksRef.current = []
    screenBlobRef.current = null
    audioBlobRef.current = null

    // Clear any previous IndexedDB chunks
    await clearChunkDB()

    let screenStream: MediaStream
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'monitor' } as MediaTrackConstraints,
        audio: false,
      })
      screenStreamRef.current = screenStream
    } catch (err: unknown) {
      if (!mountedRef.current) return false
      const name = err instanceof DOMException ? err.name : ''
      if (name === 'NotAllowedError') setError('permission-denied')
      else if (name === 'NotFoundError') setError('no-device')
      else setError('permission-denied')
      setStatus('idle')
      return false
    }

    let audioStream: MediaStream
    try {
      audioStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioStreamRef.current = audioStream
    } catch (err: unknown) {
      screenStream.getTracks().forEach(t => t.stop())
      screenStreamRef.current = null
      if (!mountedRef.current) return false
      const name = err instanceof DOMException ? err.name : ''
      if (name === 'NotAllowedError') setError('permission-denied')
      else if (name === 'NotFoundError') setError('no-device')
      else setError('permission-denied')
      setStatus('idle')
      return false
    }

    if (!mountedRef.current) {
      screenStream.getTracks().forEach(t => t.stop())
      audioStream.getTracks().forEach(t => t.stop())
      return false
    }

    const videoMime = getSupportedVideoMimeType()
    const audioMime = getSupportedAudioMimeType()

    const screenRecorder = new MediaRecorder(screenStream, {
      mimeType: videoMime,
      videoBitsPerSecond: 2_500_000,
    })
    const audioRecorder = new MediaRecorder(audioStream, {
      mimeType: audioMime,
    })

    screenRecorderRef.current = screenRecorder
    audioRecorderRef.current = audioRecorder

    // Collect chunks and persist to IndexedDB
    screenRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        screenChunksRef.current.push(e.data)
        saveChunk('screen', e.data).catch(() => {})
      }
    }
    audioRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        audioChunksRef.current.push(e.data)
        saveChunk('audio', e.data).catch(() => {})
      }
    }

    // Track ended (user stopped sharing via browser UI)
    screenStream.getVideoTracks()[0].onended = () => {
      stopRecording()
    }

    // Start recording with timeslice
    screenRecorder.start(1000)
    audioRecorder.start(1000)
    startTimeRef.current = Date.now()
    setStatus('recording')

    // Prevent browser from discarding this tab during recording
    if (navigator.locks) {
      navigator.locks.request('recording-active', { mode: 'exclusive' }, () => {
        return new Promise<void>((resolve) => {
          lockReleaseRef.current = resolve
        })
      }).catch(() => {})
    }

    // Duration timer + auto-stop
    timerRef.current = setInterval(() => {
      if (!mountedRef.current) return
      const elapsed = Date.now() - startTimeRef.current
      setDuration(elapsed)
      if (elapsed >= maxDurationMs) {
        stopRecording()
      }
    }, 1000)

    return true
  }, [maxDurationMs, stopRecording])

  const uploadRecordings = useCallback(async (taskId: string, claimId: string) => {
    setStatus('uploading')
    setUploadProgress(0)
    setError(null)

    const screenBlob = screenBlobRef.current
    const audioBlob = audioBlobRef.current

    if (!screenBlob || !audioBlob) {
      throw new Error('No recording data')
    }

    let screenUrl = screenRecUrl
    let audioUrlResult = audioUrl

    const screenProgress = { loaded: 0, total: screenBlob.size }
    const audioProgress = { loaded: 0, total: audioBlob.size }

    const updateTotalProgress = () => {
      const total = screenProgress.total + audioProgress.total
      const loaded = screenProgress.loaded + audioProgress.loaded
      if (total > 0 && mountedRef.current) {
        setUploadProgress(Math.round((loaded / total) * 100))
      }
    }

    if (!screenUrl) {
      try {
        const res = await fetch('/api/oss/presign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId, claimId, type: 'screen' }),
        })
        if (!res.ok) throw new Error('Failed to get presign URL')
        const { uploadUrl, objectUrl } = await res.json()
        await xhrUpload(uploadUrl, screenBlob, 'video/webm', (loaded, total) => {
          screenProgress.loaded = loaded
          screenProgress.total = total
          updateTotalProgress()
        })
        screenUrl = objectUrl
        if (mountedRef.current) setScreenRecUrl(objectUrl)
      } catch {
        if (mountedRef.current) {
          setError('upload-failed')
          setStatus('completed')
        }
        throw new Error('Screen upload failed')
      }
    } else {
      screenProgress.loaded = screenProgress.total
      updateTotalProgress()
    }

    if (!audioUrlResult) {
      try {
        const res = await fetch('/api/oss/presign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId, claimId, type: 'audio' }),
        })
        if (!res.ok) throw new Error('Failed to get presign URL')
        const { uploadUrl, objectUrl } = await res.json()
        await xhrUpload(uploadUrl, audioBlob, 'audio/webm', (loaded, total) => {
          audioProgress.loaded = loaded
          audioProgress.total = total
          updateTotalProgress()
        })
        audioUrlResult = objectUrl
        if (mountedRef.current) setAudioUrl(objectUrl)
      } catch {
        if (mountedRef.current) {
          setError('upload-failed')
          setStatus('completed')
        }
        throw new Error('Audio upload failed')
      }
    } else {
      audioProgress.loaded = audioProgress.total
      updateTotalProgress()
    }

    if (mountedRef.current) setStatus('done')

    // Persist URLs to database so they survive tab discards
    try {
      await fetch(`/api/tasks/${taskId}/my-claim`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ screenRecUrl: screenUrl, audioUrl: audioUrlResult }),
      })
    } catch (e) {
      console.warn('Failed to persist recording URLs to claim:', e)
    }

    // Clear IndexedDB chunks after successful upload
    await clearChunkDB()

    return { screenRecUrl: screenUrl!, audioUrl: audioUrlResult! }
  }, [screenRecUrl, audioUrl])

  // Recover chunks from IndexedDB and upload (called after tab discard recovery)
  const recoverAndUpload = useCallback(async (taskId: string, claimId: string): Promise<boolean> => {
    try {
      const screenChunks = await loadChunks('screen')
      const audioChunks = await loadChunks('audio')

      if (screenChunks.length === 0 && audioChunks.length === 0) {
        return false
      }

      setStatus('uploading')
      setUploadProgress(0)

      const screenBlob = screenChunks.length > 0 ? new Blob(screenChunks, { type: 'video/webm' }) : null
      const audioBlob = audioChunks.length > 0 ? new Blob(audioChunks, { type: 'audio/webm' }) : null

      const totalSize = (screenBlob?.size || 0) + (audioBlob?.size || 0)
      let uploaded = 0

      let screenUrl: string | null = null
      let audioUrlResult: string | null = null

      if (screenBlob) {
        const res = await fetch('/api/oss/presign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId, claimId, type: 'screen' }),
        })
        if (!res.ok) throw new Error('Failed to get presign URL')
        const { uploadUrl, objectUrl } = await res.json()
        await xhrUpload(uploadUrl, screenBlob, 'video/webm', (loaded) => {
          if (mountedRef.current) setUploadProgress(Math.round(((uploaded + loaded) / totalSize) * 100))
        })
        screenUrl = objectUrl
        uploaded += screenBlob.size
        if (mountedRef.current) setScreenRecUrl(objectUrl)
      }

      if (audioBlob) {
        const res = await fetch('/api/oss/presign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId, claimId, type: 'audio' }),
        })
        if (!res.ok) throw new Error('Failed to get presign URL')
        const { uploadUrl, objectUrl } = await res.json()
        await xhrUpload(uploadUrl, audioBlob, 'audio/webm', (loaded) => {
          if (mountedRef.current) setUploadProgress(Math.round(((uploaded + loaded) / totalSize) * 100))
        })
        audioUrlResult = objectUrl
        if (mountedRef.current) setAudioUrl(objectUrl)
      }

      // Save URLs to claim
      try {
        await fetch(`/api/tasks/${taskId}/my-claim`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ screenRecUrl: screenUrl, audioUrl: audioUrlResult }),
        })
      } catch {}

      await clearChunkDB()
      if (mountedRef.current) setStatus('done')
      return true
    } catch (e) {
      console.error('Recovery upload failed:', e)
      if (mountedRef.current) {
        setError('upload-failed')
        setStatus('idle')
      }
      return false
    }
  }, [])

  return {
    status,
    duration,
    uploadProgress,
    error,
    screenRecUrl,
    audioUrl,
    startRecording,
    stopRecording,
    uploadRecordings,
    recoverAndUpload,
  }
}
