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

  // 재생 목록에 새 비디오 추가
  const addVideo = useCallback(() => {
    setError(null)
    if (!newVideoUrl.trim() || !newVideoTitle.trim()) {
      setError("비디오 제목과 URL을 모두 입력해주세요.")
      return
    }

    const youtubeId = extractVideoId(newVideoUrl)
    if (!youtubeId) {
      setError("유효하지 않은 YouTube URL입니다. 올바른 비디오 링크를 입력해주세요.")
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
  }, [newVideoUrl, newVideoTitle, extractVideoId, playlist.length, currentTrackIndex])

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
  }, [playlist.length, currentTrackIndex, playMode, selectVideo])

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
  const opts = {
    height: "1",
    width: "1",
    playerVars: {
      autoplay: 1,
      controls: 0,
      disablekb: 1,
      modestbranding: 1,
      rel: 0,
      iv_load_policy: 3,
    },
  }

  // 플레이어 상태를 주기적으로 체크 (비활성화 상태에서도 작동)
  const startStateCheck = useCallback(() => {
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current)
    }

    checkIntervalRef.current = setInterval(() => {
      if (playerRef.current && isPlaying) {
        try {
          const state = playerRef.current.getPlayerState()
          // 0 = ended
          if (state === 0) {
            if (playMode === "repeat-all" || playMode === "shuffle") {
              playNext()
            } else {
              // playMode === "none"
              const nextIndex = currentTrackIndex !== null ? currentTrackIndex + 1 : 0
              if (nextIndex < playlist.length) {
                playNext()
              } else {
                setIsPlaying(false)
              }
            }
          }
        } catch (e) {
          console.error("Player state check error:", e)
        }
      }
    }, 1000) // 1초마다 체크
  }, [isPlaying, playMode, currentTrackIndex, playlist.length, playNext])

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
  }, [])

  // YouTube 플레이어 일시정지 시
  const onPlayerPause = useCallback(() => {
    setIsPlaying(false)
  }, [])

  // YouTube 플레이어 상태 변경 시
  const onPlayerStateChange = useCallback(
    (event: YouTubeEvent) => {
      const state = event.data
      // 0 = ended
      if (state === 0) {
        if (playMode === "repeat-all" || playMode === "shuffle") {
          playNext()
        } else {
          // playMode === "none"
          const nextIndex = currentTrackIndex !== null ? currentTrackIndex + 1 : 0
          if (nextIndex < playlist.length) {
            playNext()
          } else {
            setIsPlaying(false)
          }
        }
      } else if (state === 1) {
        // 1 = playing
        setIsPlaying(true)
      } else if (state === 2) {
        // 2 = paused
        setIsPlaying(false)
      }
    },
    [playMode, playNext, currentTrackIndex, playlist.length],
  )

  // YouTube 플레이어 종료 시 (백업용)
  const onPlayerEnd = useCallback(() => {
    if (playMode === "repeat-all" || playMode === "shuffle") {
      playNext()
    } else {
      const nextIndex = currentTrackIndex !== null ? currentTrackIndex + 1 : 0
      if (nextIndex < playlist.length) {
        playNext()
      } else {
        setIsPlaying(false)
      }
    }
  }, [playNext, playMode, currentTrackIndex, playlist.length])

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
                  {/* YouTube iframe - 매우 작은 크기로 숨김 */}
                  <div className="fixed bottom-0 right-0 w-1 h-1 overflow-hidden z-[-1]">
                    <YouTube
                      key={currentVideo.youtubeId}
                      videoId={currentVideo.youtubeId}
                      opts={opts}
                      onReady={onPlayerReady}
                      onPlay={onPlayerPlay}
                      onPause={onPlayerPause}
                      onEnd={onPlayerEnd}
                      onStateChange={onPlayerStateChange}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    백그라운드에서도 자동으로 다음 곡이 재생됩니다.
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
