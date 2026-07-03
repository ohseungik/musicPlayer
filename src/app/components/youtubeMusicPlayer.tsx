"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { SkipForward, SkipBack, Plus, Trash2, Play, Pause, Repeat, Shuffle } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import YouTube, { type YouTubeEvent, type YouTubePlayer } from "react-youtube"

interface PlaylistItem {
  id: number
  youtubeId: string
  title: string
  originalUrl: string
}

type PlayMode = "none" | "repeat-all" | "shuffle"

const LOCAL_STORAGE_KEY = "youtube_music_playlist"
const LOCAL_STORAGE_CURRENT_INDEX_KEY = "youtube_music_current_index"
const LOCAL_STORAGE_PLAY_MODE_KEY = "youtube_music_play_mode"

export default function YouTubeMusicPlayer() {
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([])
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [newVideoUrl, setNewVideoUrl] = useState("")
  const [newVideoTitle, setNewVideoTitle] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [playMode, setPlayMode] = useState<PlayMode>("none")

  const playerRef = useRef<YouTubePlayer | null>(null)
  const playedIndicesRef = useRef<number[]>([])
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  const currentVideo = currentTrackIndex !== null ? playlist[currentTrackIndex] : null

  // 1. 컴포넌트 마운트 시 localStorage에서 재생 목록 불러오기
  useEffect(() => {
    try {
      const savedPlaylist = localStorage.getItem(LOCAL_STORAGE_KEY)
      if (savedPlaylist) {
        setPlaylist(JSON.parse(savedPlaylist))
      }

      const savedIndex = localStorage.getItem(LOCAL_STORAGE_CURRENT_INDEX_KEY)
      if (savedIndex !== null) {
        const index = Number.parseInt(savedIndex, 10)
        if (!isNaN(index) && index >= 0 && (savedPlaylist ? JSON.parse(savedPlaylist).length > index : false)) {
          setCurrentTrackIndex(index)
        }
      }

      const savedPlayMode = localStorage.getItem(LOCAL_STORAGE_PLAY_MODE_KEY)
      if (savedPlayMode && ["none", "repeat-all", "shuffle"].includes(savedPlayMode)) {
        setPlayMode(savedPlayMode as PlayMode)
      }
    } catch (e) {
      console.error("Failed to load playlist from localStorage", e)
    }
  }, [])

  // 2. playlist, currentTrackIndex, playMode 변경 시 localStorage에 저장
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(playlist))
      localStorage.setItem(LOCAL_STORAGE_CURRENT_INDEX_KEY, currentTrackIndex !== null ? String(currentTrackIndex) : "")
      localStorage.setItem(LOCAL_STORAGE_PLAY_MODE_KEY, playMode)
    } catch (e) {
      console.error("Failed to save playlist to localStorage", e)
    }
  }, [playlist, currentTrackIndex, playMode])

  // YouTube URL에서 비디오 ID 추출
  const extractVideoId = useCallback((url: string): string | null => {
    const regExp = /^.*(?:youtu.be\/|v\/|e\/|embed\/|watch\?v=|watch\?feature=player_embedded&v=)([^#&?]*).*/
    const match = url.match(regExp)
    return match && match[1].length === 11 ? match[1] : null
  }, [])

  // YouTube 재생목록 ID 추출 (PL로 시작)
  const extractPlaylistId = useCallback((url: string): string | null => {
    const regExp = /[?&]list=([^#&?]+)/
    const match = url.match(regExp)
    return match ? match[1] : null
  }, [])

  // 재생 목록에 새 비디오 추가
  const addVideo = useCallback(() => {
    setError(null)
    if (!newVideoUrl.trim() || !newVideoTitle.trim()) {
      setError("비디오 제목과 URL을 모두 입력해주세요.")
      return
    }

    // YouTube 재생목록인지 확인
    const playlistId = extractPlaylistId(newVideoUrl)
    if (playlistId && playlistId.startsWith('PL')) {
      // 재생목록 추가
      const newId = Date.now()
      const newPlaylistItem = { 
        id: newId, 
        youtubeId: `PLAYLIST:${playlistId}`, // 재생목록임을 표시
        title: `📁 ${newVideoTitle.trim()}`, 
        originalUrl: newVideoUrl.trim() 
      }
      setPlaylist((prev) => {
        const updatedPlaylist = [...prev, newPlaylistItem]
        if (prev.length === 0 && currentTrackIndex === null) {
          setCurrentTrackIndex(0)
          setIsPlaying(true)
        }
        return updatedPlaylist
      })
      setNewVideoUrl("")
      setNewVideoTitle("")
      return
    }

    // 단일 비디오 추가
    const youtubeId = extractVideoId(newVideoUrl)
    if (!youtubeId) {
      setError("유효하지 않은 YouTube URL입니다. 올바른 비디오 또는 재생목록 링크를 입력해주세요.")
      return
    }

    const newId = Date.now()
    const newPlaylistItem = { id: newId, youtubeId, title: newVideoTitle.trim(), originalUrl: newVideoUrl.trim() }
    setPlaylist((prev) => {
      const updatedPlaylist = [...prev, newPlaylistItem]
      if (prev.length === 0 && currentTrackIndex === null) {
        setCurrentTrackIndex(0)
        setIsPlaying(true)
      }
      return updatedPlaylist
    })
    setNewVideoUrl("")
    setNewVideoTitle("")
  }, [newVideoUrl, newVideoTitle, extractVideoId, extractPlaylistId, currentTrackIndex])

  // 특정 인덱스의 비디오 선택 및 재생
  const selectVideo = useCallback(
    (index: number) => {
      if (index >= 0 && index < playlist.length) {
        setCurrentTrackIndex(index)
        setIsPlaying(true)
        if (playMode === "shuffle") {
          playedIndicesRef.current = [index]
        }
      }
    },
    [playlist.length, playMode],
  )

  // 다음 곡 재생 (재생 모드에 따라 다름)
  const playNext = useCallback(() => {
    if (playlist.length === 0) return

    let nextIndex: number | null = null

    if (playMode === "shuffle") {
      const availableIndices = playlist.map((_, i) => i).filter((i) => !playedIndicesRef.current.includes(i))

      if (availableIndices.length === 0) {
        playedIndicesRef.current = []
        nextIndex = Math.floor(Math.random() * playlist.length)
      } else {
        nextIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)]
      }
      playedIndicesRef.current.push(nextIndex)
    } else {
      nextIndex = (currentTrackIndex === null ? 0 : currentTrackIndex + 1) % playlist.length
      if (playMode === "none" && nextIndex === 0 && currentTrackIndex !== null && playlist.length > 1) {
        setIsPlaying(false)
        setCurrentTrackIndex(null)
        return
      }
    }

    if (nextIndex !== null) {
      selectVideo(nextIndex)
    }
  }, [playlist, currentTrackIndex, playMode, selectVideo])

  // 이전 곡 재생
  const playPrevious = useCallback(() => {
    if (playlist.length === 0) return
    const prevIndex = currentTrackIndex === null ? 0 : (currentTrackIndex - 1 + playlist.length) % playlist.length
    selectVideo(prevIndex)
  }, [playlist.length, currentTrackIndex, selectVideo])

  // 실제 재생/일시정지 토글
  const togglePlayPause = useCallback(() => {
    if (!playerRef.current) return

    if (isPlaying) {
      playerRef.current.pauseVideo()
    } else {
      playerRef.current.playVideo()
    }
  }, [isPlaying])

  // 재생 모드 토글
  const togglePlayMode = useCallback(() => {
    setPlayMode((prevMode) => {
      if (prevMode === "none") return "repeat-all"
      if (prevMode === "repeat-all") {
        playedIndicesRef.current = []
        return "shuffle"
      }
      return "none"
    })
  }, [])

  // 재생 목록에서 트랙 제거
  const removeVideo = useCallback(
    (idToRemove: number) => {
      const indexToRemove = playlist.findIndex((video) => video.id === idToRemove)
      if (indexToRemove === -1) return

      const newPlaylist = playlist.filter((video) => video.id !== idToRemove)
      setPlaylist(newPlaylist)

      if (currentTrackIndex === indexToRemove) {
        if (playerRef.current) {
          playerRef.current.stopVideo()
        }
        if (newPlaylist.length === 0) {
          setCurrentTrackIndex(null)
          setIsPlaying(false)
        } else if (indexToRemove < newPlaylist.length) {
          setCurrentTrackIndex(indexToRemove)
          setIsPlaying(true)
        } else {
          setCurrentTrackIndex(newPlaylist.length - 1)
          setIsPlaying(true)
        }
      } else if (currentTrackIndex !== null && indexToRemove < currentTrackIndex) {
        setCurrentTrackIndex(currentTrackIndex - 1)
      }
      playedIndicesRef.current = playedIndicesRef.current.filter((idx) => idx !== indexToRemove)
      playedIndicesRef.current = playedIndicesRef.current.map((idx) => (idx > indexToRemove ? idx - 1 : idx))
    },
    [playlist, currentTrackIndex],
  )

  // YouTube 플레이어 옵션
  const isPlaylist = currentVideo?.youtubeId.startsWith('PLAYLIST:') || false
  const playlistId = isPlaylist && currentVideo ? currentVideo.youtubeId.replace('PLAYLIST:', '') : null

  const opts = {
    // Chrome은 1x1 크기의 숨김 iframe을 "보이지 않는 프레임"으로 판단해
    // 화면이 꺼지거나 탭이 백그라운드로 가면 재생을 강제로 스로틀링/정지시킴.
    // 충분히 큰 크기를 유지해야 백그라운드에서도 재생(및 loop)이 계속됨.
    height: "200",
    width: "200",
    playerVars: isPlaylist ? {
      autoplay: 1,
      controls: 0,
      disablekb: 1,
      modestbranding: 1,
      rel: 0,
      iv_load_policy: 3,
      loop: 1,
      listType: 'playlist' as const,
      list: playlistId || "",
      playlist: playlistId || "", // loop를 위해 필요
    } : {
      autoplay: 1,
      controls: 0,
      disablekb: 1,
      modestbranding: 1,
      rel: 0,
      iv_load_policy: 3,
      loop: 1,
      playlist: currentVideo?.youtubeId || "",
    },
  }

  // 단일 곡을 처음부터 다시 재생 (반복 재생용)
  const restartCurrentVideo = useCallback(() => {
    if (!playerRef.current) return
    try {
      playerRef.current.seekTo(0, true)
      playerRef.current.playVideo()
    } catch (err) {
      console.error("Repeat restart error:", err)
    }
  }, [])

  // 플레이어 상태를 주기적으로 체크 (비활성화 상태에서도 작동)
  const startStateCheck = useCallback(() => {
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current)
    }

    checkIntervalRef.current = setInterval(() => {
      if (playerRef.current && isPlaying) {
        try {
          const state = playerRef.current.getPlayerState()
          const currentTime = playerRef.current.getCurrentTime()
          const duration = playerRef.current.getDuration()
          
          // 0 = ended 또는 현재 시간이 전체 시간에 거의 도달한 경우
          // 실제로 곡이 끝나기 전에 미리 되감아, 오디오 출력이 끊기는 순간(=백그라운드에서
          // 브라우저가 재생을 새로 시작하는 것으로 간주해 차단할 수 있는 시점)을 최대한 피함
          if (state === 0 || (duration > 0 && currentTime >= duration - 1.5)) {
            // playMode가 "repeat-all" 또는 "shuffle"일 때만 다음 곡으로 이동
            if (playMode === "repeat-all" || playMode === "shuffle") {
              playNext()
            } else if (!isPlaylist) {
              restartCurrentVideo()
            }
          }
        } catch (e) {
          console.error("Player state check error:", e)
        }
      }
    }, 500) // 0.5초마다 체크 (더 빠른 반응)
  }, [isPlaying, playMode, playNext, isPlaylist, restartCurrentVideo])

  // 컴포넌트 언마운트 시 인터벌 정리
  useEffect(() => {
    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current)
      }
    }
  }, [])

  // isPlaying 상태 변경 시 체크 시작/중지
  useEffect(() => {
    if (isPlaying) {
      startStateCheck()
    } else {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current)
      }
    }
  }, [isPlaying, startStateCheck])

  // Wake Lock API - 화면 꺼짐 방지 (모바일 데스크톱 모드용)
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ("wakeLock" in navigator && isPlaying) {
          wakeLockRef.current = await navigator.wakeLock.request("screen")
          console.log("Wake Lock activated")
        }
      } catch (err) {
        console.log("Wake Lock error:", err)
      }
    }

    const releaseWakeLock = async () => {
      if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release()
          wakeLockRef.current = null
          console.log("Wake Lock released")
        } catch (err) {
          console.log("Wake Lock release error:", err)
        }
      }
    }

    if (isPlaying) {
      requestWakeLock()
    } else {
      releaseWakeLock()
    }

    return () => {
      releaseWakeLock()
    }
  }, [isPlaying])

  // 탭/화면이 백그라운드에서 다시 활성화될 때 재생이 끊겨있으면 자동으로 재개
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && isPlaying && playerRef.current) {
        try {
          const state = playerRef.current.getPlayerState()
          if (state !== 1 /* playing */ && state !== 3 /* buffering */) {
            playerRef.current.playVideo()
          }
        } catch (err) {
          console.error("Visibility resume error:", err)
        }
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [isPlaying])

  // Media Session API - 미디어 컨트롤 알림에 재생 정보 표시
  useEffect(() => {
    if (!("mediaSession" in navigator) || !currentVideo) return

    const updateMediaSession = () => {
      try {
        // 현재 곡 정보 설정
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentVideo.title,
          artist: "YouTube Music Player",
          album: `재생목록 (${currentTrackIndex !== null ? currentTrackIndex + 1 : 0}/${playlist.length})`,
          artwork: [
            {
              src: `https://img.youtube.com/vi/${currentVideo.youtubeId}/maxresdefault.jpg`,
              sizes: "1280x720",
              type: "image/jpeg",
            },
            {
              src: `https://img.youtube.com/vi/${currentVideo.youtubeId}/hqdefault.jpg`,
              sizes: "480x360",
              type: "image/jpeg",
            },
            {
              src: `https://img.youtube.com/vi/${currentVideo.youtubeId}/mqdefault.jpg`,
              sizes: "320x180",
              type: "image/jpeg",
            },
          ],
        })

        // 재생/일시정지
        navigator.mediaSession.setActionHandler("play", () => {
          console.log("Media Session: Play")
          if (playerRef.current) {
            playerRef.current.playVideo()
          }
        })

        navigator.mediaSession.setActionHandler("pause", () => {
          console.log("Media Session: Pause")
          if (playerRef.current) {
            playerRef.current.pauseVideo()
          }
        })

        // 이전 곡
        navigator.mediaSession.setActionHandler("previoustrack", () => {
          console.log("Media Session: Previous Track")
          playPrevious()
        })

        // 다음 곡
        navigator.mediaSession.setActionHandler("nexttrack", () => {
          console.log("Media Session: Next Track")
          playNext()
        })

        // 10초 뒤로
        navigator.mediaSession.setActionHandler("seekbackward", (details) => {
          console.log("Media Session: Seek Backward")
          if (playerRef.current) {
            const skipTime = details.seekOffset || 10
            const currentTime = playerRef.current.getCurrentTime()
            playerRef.current.seekTo(Math.max(0, currentTime - skipTime), true)
          }
        })

        // 10초 앞으로
        navigator.mediaSession.setActionHandler("seekforward", (details) => {
          console.log("Media Session: Seek Forward")
          if (playerRef.current) {
            const skipTime = details.seekOffset || 10
            const currentTime = playerRef.current.getCurrentTime()
            playerRef.current.seekTo(currentTime + skipTime, true)
          }
        })

        // 특정 위치로 이동
        navigator.mediaSession.setActionHandler("seekto", (details) => {
          console.log("Media Session: Seek To")
          if (playerRef.current && details.seekTime !== null && details.seekTime !== undefined) {
            playerRef.current.seekTo(details.seekTime, true)
          }
        })

        console.log("✅ Media Session 설정 완료:", currentVideo.title)
      } catch (err) {
        console.error("Media Session 설정 오류:", err)
      }
    }

    // 초기 설정
    updateMediaSession()

    // YouTube iframe이 덮어쓸 수 있으므로 주기적으로 재설정
    const interval = setInterval(updateMediaSession, 2000)

    return () => {
      clearInterval(interval)
      if ("mediaSession" in navigator) {
        try {
          navigator.mediaSession.setActionHandler("play", null)
          navigator.mediaSession.setActionHandler("pause", null)
          navigator.mediaSession.setActionHandler("previoustrack", null)
          navigator.mediaSession.setActionHandler("nexttrack", null)
          navigator.mediaSession.setActionHandler("seekbackward", null)
          navigator.mediaSession.setActionHandler("seekforward", null)
          navigator.mediaSession.setActionHandler("seekto", null)
          navigator.mediaSession.metadata = null
        } catch (err) {
          console.error("Media Session 정리 오류:", err)
        }
      }
    }
  }, [currentVideo, currentTrackIndex, playlist.length, playNext, playPrevious])

  // YouTube 플레이어 준비 완료 시
  const onPlayerReady = useCallback(
    (event: YouTubeEvent) => {
      playerRef.current = event.target
      if (isPlaying) {
        event.target.playVideo()
      }
    },
    [isPlaying],
  )

  // YouTube 플레이어 재생 시
  const onPlayerPlay = useCallback(() => {
    setIsPlaying(true)
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "playing"
    }
  }, [])

  // YouTube 플레이어 일시정지 시
  const onPlayerPause = useCallback(() => {
    setIsPlaying(false)
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "paused"
    }
  }, [])

  // YouTube 플레이어 상태 변경 시
  const onPlayerStateChange = useCallback(
    (event: YouTubeEvent) => {
      const state = event.data
      // 0 = ended
      if (state === 0) {
        if (playMode === "repeat-all" || playMode === "shuffle") {
          playNext()
        } else if (!isPlaylist) {
          // playMode === "none" (단일 곡): 계속 반복 재생
          restartCurrentVideo()
        }
      } else if (state === 1) {
        // 1 = playing
        setIsPlaying(true)
      } else if (state === 2) {
        // 2 = paused
        setIsPlaying(false)
      }
    },
    [playMode, playNext, isPlaylist, restartCurrentVideo],
  )

  // YouTube 플레이어 종료 시 (백업용)
  const onPlayerEnd = useCallback(() => {
    if (playMode === "repeat-all" || playMode === "shuffle") {
      playNext()
    } else if (!isPlaylist) {
      restartCurrentVideo()
    }
  }, [playNext, playMode, isPlaylist, restartCurrentVideo])

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>YouTube 뮤직 플레이어</CardTitle>
          <CardDescription>YouTube URL을 추가하여 나만의 비디오 재생 목록을 만들고 음악처럼 즐기세요.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {/* 새 비디오 추가 섹션 */}
          <div className="grid gap-2">
            <h3 className="text-lg font-semibold">새 비디오 추가</h3>
            <Input
              type="text"
              placeholder="비디오 제목 (예: 나의 플레이리스트 곡)"
              value={newVideoTitle}
              onChange={(e) => setNewVideoTitle(e.target.value)}
              className="w-full"
            />
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                type="url"
                placeholder="YouTube URL (예: https://www.youtube.com/watch?v=8DcrMJ4_7Uc)"
                value={newVideoUrl}
                onChange={(e) => setNewVideoUrl(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === "Enter") addVideo()
                }}
                className="flex-grow"
              />
              <Button onClick={addVideo} disabled={!newVideoUrl.trim() || !newVideoTitle.trim()}>
                <Plus className="h-4 w-4 mr-2" /> 추가
              </Button>
            </div>
            {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
          </div>

          {/* 현재 재생 중인 비디오 및 컨트롤 */}
          <div className="grid gap-2">
            <h3 className="text-lg font-semibold">현재 재생 중</h3>
            <Card className="p-4 flex flex-col gap-4">
              {currentVideo ? (
                <>
                  <div className="flex items-center flex-wrap gap-x-2 gap-y-4">
                    <div className="flex-grow min-w-0 w-full">
                      <p className="font-medium text-base sm:text-lg line-clamp-1">{currentVideo.title}</p>
                      <p className="text-xs sm:text-sm text-muted-foreground line-clamp-1">
                        {currentVideo.originalUrl}
                      </p>
                    </div>
                    <div className="flex gap-2 w-full justify-center">
                      <Button variant="ghost" size="icon" onClick={playPrevious} disabled={playlist.length === 0}>
                        <SkipBack className="h-5 w-5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={togglePlayPause}
                        disabled={!currentVideo || playlist.length === 0}
                      >
                        {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={playNext} disabled={playlist.length === 0}>
                        <SkipForward className="h-5 w-5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={togglePlayMode}
                        className={playMode !== "none" ? "text-primary" : ""}
                        title={
                          playMode === "none" ? "반복 없음" : playMode === "repeat-all" ? "전체 반복" : "랜덤 재생"
                        }
                      >
                        {playMode === "shuffle" ? <Shuffle className="h-5 w-5" /> : <Repeat className="h-5 w-5" />}
                      </Button>
                    </div>
                  </div>
                  {/* YouTube iframe - 시각적으로만 숨김 (백그라운드 재생 유지를 위해 실제 크기는 충분히 확보) */}
                  <div className="fixed bottom-0 right-0 w-[200px] h-[200px] overflow-hidden opacity-0 pointer-events-none -z-10">
                    <YouTube
                      key={currentVideo.youtubeId}
                      videoId={isPlaylist ? undefined : currentVideo.youtubeId}
                      opts={opts}
                      onReady={onPlayerReady}
                      onPlay={onPlayerPlay}
                      onPause={onPlayerPause}
                      onEnd={onPlayerEnd}
                      onStateChange={onPlayerStateChange}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    🎵 현재 곡: <span className="font-semibold">{currentVideo.title}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    💡 현재 곡이 자동으로 반복 재생됩니다. 다음 곡으로 넘어가려면 ⏭️ 버튼을 클릭하세요.
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground text-center py-8">재생할 비디오를 선택하거나 추가하세요.</p>
              )}
            </Card>
          </div>

          {/* 재생 목록 */}
          <div className="grid gap-2">
            <h3 className="text-lg font-semibold">재생 목록 ({playlist.length} 곡)</h3>
            {playlist.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">재생 목록이 비어있습니다. 비디오를 추가하세요!</p>
            ) : (
              <ScrollArea className="h-64 w-full rounded-md border">
                <div className="p-4">
                  {playlist.map((video, index) => (
                    <div
                      key={video.id}
                      className={`flex items-center justify-between p-2 rounded-md ${
                        currentTrackIndex === index ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                      } ${index > 0 ? "mt-2" : ""}`}
                    >
                      <div className="flex-grow min-w-0 cursor-pointer" onClick={() => selectVideo(index)}>
                        <p className="font-medium line-clamp-1">{video.title}</p>
                        <p className="text-sm text-muted-foreground line-clamp-1">{video.originalUrl}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeVideo(video.id)}
                        className="ml-auto text-destructive hover:text-destructive-foreground"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
